import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  CONTACT_INQUIRY_STATUSES,
  CONTACT_SUPPORT_EMAIL,
  CONTACT_TOPIC_LABELS,
  type ContactInquiryStatus,
  type ContactTopic,
} from '@safescript/shared';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { MailService } from './mail.service';
import {
  contactConfirmation,
  contactTeamNotification,
} from './contact-email.templates';
import {
  CreateContactInquiryDto,
  ListContactInquiriesQueryDto,
  UpdateContactInquiryDto,
} from './dto/contact.dto';

const PREVIEW_LEN = 140;

const handledBySelect = {
  id: true,
  firstName: true,
  lastName: true,
} as const;

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async create(
    dto: CreateContactInquiryDto,
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    if (dto.companyWebsite?.trim()) {
      return { message: 'Thanks — we received your message and will follow up shortly.' };
    }

    const inquiry = await this.prisma.contactInquiry.create({
      data: {
        fullName: dto.fullName.trim(),
        workEmail: dto.workEmail.trim().toLowerCase(),
        organization: dto.organization.trim(),
        topic: dto.topic,
        message: dto.message.trim(),
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent?.slice(0, 512),
      },
    });

    await this.audit.log({
      action: 'CONTACT_INQUIRY_CREATED',
      module: 'contact',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      metadata: { inquiryId: inquiry.id, topic: inquiry.topic },
    });

    const topicLabel = CONTACT_TOPIC_LABELS[inquiry.topic as ContactTopic] ?? inquiry.topic;
    const to = this.config.get<string>('CONTACT_TO_EMAIL', CONTACT_SUPPORT_EMAIL);
    const content = {
      fullName: inquiry.fullName,
      workEmail: inquiry.workEmail,
      organization: inquiry.organization,
      topicLabel,
      message: inquiry.message,
    };
    const notify = contactTeamNotification(content);
    const confirm = contactConfirmation(content);

    const [notified, confirmed] = await Promise.all([
      this.mail.send({
        to,
        replyTo: inquiry.workEmail,
        subject: notify.subject,
        text: notify.text,
        html: notify.html,
        idempotencyKey: `contact-notify-${inquiry.id}`,
        tags: [{ name: 'category', value: 'contact_notify' }],
      }),
      this.mail.send({
        to: inquiry.workEmail,
        replyTo: to,
        subject: confirm.subject,
        text: confirm.text,
        html: confirm.html,
        idempotencyKey: `contact-confirm-${inquiry.id}`,
        tags: [{ name: 'category', value: 'contact_confirm' }],
      }),
    ]);

    if (!notified) {
      this.logger.error(
        `Contact inquiry ${inquiry.id} saved but the team notification email was not sent`,
      );
    }
    if (!confirmed) {
      this.logger.warn(
        `Contact inquiry ${inquiry.id} saved but the confirmation email was not sent`,
      );
    }

    return { message: 'Thanks — we received your message and will follow up shortly.' };
  }

  handleResendWebhook(
    payload: string,
    headers: { id?: string; timestamp?: string; signature?: string },
  ) {
    if (!this.mail.verifyWebhook({ payload, ...headers })) {
      throw new BadRequestException('Invalid Resend webhook signature');
    }

    let type = 'unknown';
    let emailId = '';
    try {
      const event = JSON.parse(payload) as {
        type?: string;
        data?: { email_id?: string };
      };
      type = event.type ?? type;
      emailId = event.data?.email_id ?? '';
    } catch {
      throw new BadRequestException('Invalid webhook JSON');
    }

    this.logger.log(
      `Resend webhook received type=${type}${emailId ? ` email_id=${emailId}` : ''}`,
    );
    return { received: true };
  }

  async list(query: ListContactInquiriesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(query);
    const countWhere = this.buildWhere({ ...query, status: undefined });

    const [rows, total, grouped] = await Promise.all([
      this.prisma.contactInquiry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          fullName: true,
          workEmail: true,
          organization: true,
          topic: true,
          message: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.contactInquiry.count({ where }),
      this.prisma.contactInquiry.groupBy({
        by: ['status'],
        where: countWhere,
        _count: true,
        orderBy: { status: 'asc' },
      }),
    ]);

    const counts = {
      all: 0,
      new: 0,
      open: 0,
      closed: 0,
    };
    for (const row of grouped) {
      const n = row._count;
      counts.all += n;
      if (row.status === CONTACT_INQUIRY_STATUSES.NEW) counts.new = n;
      if (row.status === CONTACT_INQUIRY_STATUSES.OPEN) counts.open = n;
      if (row.status === CONTACT_INQUIRY_STATUSES.CLOSED) counts.closed = n;
    }

    return {
      data: rows.map((row) => ({
        id: row.id,
        fullName: row.fullName,
        workEmail: row.workEmail,
        organization: row.organization,
        topic: row.topic,
        topicLabel: CONTACT_TOPIC_LABELS[row.topic as ContactTopic] ?? row.topic,
        preview: this.preview(row.message),
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      counts,
    };
  }

  async summary() {
    const grouped = await this.prisma.contactInquiry.groupBy({
      by: ['status'],
      _count: true,
      orderBy: { status: 'asc' },
    });
    const counts = { all: 0, new: 0, open: 0, closed: 0 };
    for (const row of grouped) {
      const n = row._count;
      counts.all += n;
      if (row.status === CONTACT_INQUIRY_STATUSES.NEW) counts.new = n;
      if (row.status === CONTACT_INQUIRY_STATUSES.OPEN) counts.open = n;
      if (row.status === CONTACT_INQUIRY_STATUSES.CLOSED) counts.closed = n;
    }
    return counts;
  }

  async findById(id: string) {
    const inquiry = await this.prisma.contactInquiry.findUnique({
      where: { id },
      include: { handledBy: { select: handledBySelect } },
    });
    if (!inquiry) throw new NotFoundException('Inquiry not found');
    return this.formatDetail(inquiry);
  }

  async update(
    id: string,
    dto: UpdateContactInquiryDto,
    actor: { id: string },
  ) {
    const existing = await this.prisma.contactInquiry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Inquiry not found');

    const data: Prisma.ContactInquiryUpdateInput = {};
    if (dto.internalNote !== undefined) {
      data.internalNote = dto.internalNote.trim() || null;
    }
    if (dto.status && dto.status !== existing.status) {
      data.status = dto.status;
      data.handledBy = { connect: { id: actor.id } };
      data.handledAt =
        dto.status === CONTACT_INQUIRY_STATUSES.CLOSED ? new Date() : null;
    }

    const inquiry = await this.prisma.contactInquiry.update({
      where: { id },
      data,
      include: { handledBy: { select: handledBySelect } },
    });

    await this.audit.log({
      userId: actor.id,
      action: 'CONTACT_INQUIRY_UPDATED',
      module: 'contact',
      previousValue: { status: existing.status },
      newValue: { status: inquiry.status },
      metadata: { inquiryId: inquiry.id },
    });

    return this.formatDetail(inquiry);
  }

  async exportCsv(query: ListContactInquiriesQueryDto) {
    const where = this.buildWhere(query);
    const rows = await this.prisma.contactInquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
      include: { handledBy: { select: handledBySelect } },
    });

    const headers = [
      'Received',
      'Status',
      'Topic',
      'Full name',
      'Work email',
      'Organization',
      'Message',
      'Internal note',
      'Handled by',
      'Handled at',
    ];
    const csvRows = rows.map((row) => [
      row.createdAt.toISOString(),
      row.status,
      CONTACT_TOPIC_LABELS[row.topic as ContactTopic] ?? row.topic,
      row.fullName,
      row.workEmail,
      row.organization,
      row.message,
      row.internalNote ?? '',
      row.handledBy ? `${row.handledBy.firstName} ${row.handledBy.lastName}` : '',
      row.handledAt?.toISOString() ?? '',
    ]);
    return [headers, ...csvRows]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
  }

  private buildWhere(query: ListContactInquiriesQueryDto): Prisma.ContactInquiryWhereInput {
    const where: Prisma.ContactInquiryWhereInput = {};
    if (query.topic) where.topic = query.topic;
    if (query.status) where.status = query.status;
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { workEmail: { contains: search, mode: 'insensitive' } },
        { organization: { contains: search, mode: 'insensitive' } },
        { message: { contains: search, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  private preview(message: string) {
    const compact = message.replace(/\s+/g, ' ').trim();
    if (compact.length <= PREVIEW_LEN) return compact;
    return `${compact.slice(0, PREVIEW_LEN - 1).trimEnd()}…`;
  }

  private formatDetail(inquiry: {
    id: string;
    fullName: string;
    workEmail: string;
    organization: string;
    topic: string;
    message: string;
    status: string;
    internalNote: string | null;
    handledAt: Date | null;
    ipAddress: string | null;
    createdAt: Date;
    updatedAt: Date;
    handledBy: { id: string; firstName: string; lastName: string } | null;
  }) {
    return {
      id: inquiry.id,
      fullName: inquiry.fullName,
      workEmail: inquiry.workEmail,
      organization: inquiry.organization,
      topic: inquiry.topic,
      topicLabel: CONTACT_TOPIC_LABELS[inquiry.topic as ContactTopic] ?? inquiry.topic,
      message: inquiry.message,
      status: inquiry.status as ContactInquiryStatus,
      internalNote: inquiry.internalNote,
      handledAt: inquiry.handledAt,
      handledBy: inquiry.handledBy
        ? {
            id: inquiry.handledBy.id,
            fullName: `${inquiry.handledBy.firstName} ${inquiry.handledBy.lastName}`,
          }
        : null,
      ipAddress: inquiry.ipAddress,
      createdAt: inquiry.createdAt,
      updatedAt: inquiry.updatedAt,
    };
  }
}
