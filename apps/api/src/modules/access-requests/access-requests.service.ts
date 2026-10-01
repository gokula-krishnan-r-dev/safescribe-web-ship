import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PharmacyNetworkSource,
  PharmacyNetworkStatus,
  Prisma,
  UserStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes, randomUUID } from 'crypto';
import {
  ACCESS_REQUEST_ERRORS,
  ACCESS_REQUEST_LIMITS,
  ACCESS_REQUEST_MATCH_TYPES,
  ACCESS_REQUEST_PROVINCE,
  ACCESS_REQUEST_SOURCES,
  ACCESS_REQUEST_STATUSES,
  ACCESS_REQUEST_TABS,
  CONTACT_SUPPORT_EMAIL,
  DEFAULT_PHARMACY_TIMEZONE,
  DEFAULT_PRESCRIBE_DAILY_INCLUDED,
  ENTITLEMENT_PERIODS,
  ROLES,
  SAFESCRIBE_MODULES,
  accessRequestDisplayStatus,
  accessRequestMatchLabel,
  accessRequestSourceLabel,
  formatAccessRequestId,
  isExactPharmacyMatch,
  isValidOptionalPhone,
  licenceNumbersMatch,
  normalizeAccessEmail,
  normalizeAccessPhone,
  normalizeLicenceNumber,
  usagePeriodWindow,
  type AccessRequestMatchType,
  type AccessRequestStatus,
} from '@safescript/shared';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/redis/redis.service';
import { AuditService } from '@/modules/audit/audit.service';
import { MailService } from '@/modules/contact/mail.service';
import { IpAccessService } from '@/modules/ip-access/ip-access.service';
import { isUsablePublicClientIp } from '@/common/utils/client-info';
import { stabilizeAllowlistCidr } from '@/common/utils/ip-matcher';
import { slugifyPharmacyName, splitDisplayName } from '@/modules/phix-sync/phix-mapping';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import {
  ApproveAccessRequestDto,
  CreateAccessRequestDto,
  LinkExistingAccessRequestDto,
  ListAccessRequestsQueryDto,
  RejectAccessRequestDto,
} from './dto/access-request.dto';
import {
  accessCaptureKey,
  ACCESS_CAPTURE_TTL_SECONDS,
  capturedNetworksMatch,
  sanitizeUtm,
} from './access-request.util';
import {
  NetworkChangedException,
  NetworkUnavailableException,
} from './access-request.exceptions';
import {
  accessRequestConfirmation,
  accessRequestInvite,
  accessRequestTeamNotification,
} from './access-request-email.templates';
import {
  findExistingPharmacyMatch,
  type PharmacyMatchCandidate,
  type PharmacyMatchResult,
} from './find-pharmacy-match';
import { buildAccessRequestWhere, toCsvRow } from './access-request-query';

const PREVIEW_LEN = 80;
const DUPLICATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PRESCRIBE = SAFESCRIBE_MODULES.PRESCRIBE;

const PUBLIC_SUCCESS = {
  message: "Thank you. We'll verify your pharmacy and send your SafeScribe access details shortly.",
} as const;

const reviewedBySelect = {
  id: true,
  firstName: true,
  lastName: true,
} as const;

const pharmacyListSelect = {
  id: true,
  name: true,
  slug: true,
  pharmacyLicenseNumber: true,
  phixCustomer: true,
  status: true,
} as const;

const pharmacyDetailSelect = {
  id: true,
  name: true,
  slug: true,
  pharmacyLicenseNumber: true,
  phone: true,
  phixCustomer: true,
  status: true,
  timezone: true,
  _count: { select: { users: { where: { deletedAt: null } } } },
  entitlements: {
    where: { module: PRESCRIBE },
    select: { active: true, includedQuantity: true, period: true },
  },
  pharmacyNetworks: {
    where: { status: { not: PharmacyNetworkStatus.DISABLED } },
    select: {
      id: true,
      ipAddress: true,
      cidr: true,
      label: true,
      status: true,
      source: true,
    },
    take: 20,
  },
  users: {
    where: { deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      status: true,
      role: { select: { name: true, displayName: true } },
    },
    take: 40,
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

interface CaptureRecord {
  ip: string;
  capturedAt: string;
}

type Tx = Prisma.TransactionClient;

@Injectable()
export class AccessRequestsService {
  private readonly logger = new Logger(AccessRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly ipAccess: IpAccessService,
  ) {}

  async captureIp(ipAddress: string | undefined) {
    const ip = this.requireUsableIp(ipAddress);
    const token = randomBytes(32).toString('hex');
    const record: CaptureRecord = { ip, capturedAt: new Date().toISOString() };
    await this.redis.set(accessCaptureKey(token), JSON.stringify(record), ACCESS_CAPTURE_TTL_SECONDS);
    await this.audit.log({
      action: 'IP_CAPTURE_SUCCESS',
      module: 'access_requests',
      ipAddress: ip,
    });
    return { ip, captureToken: token };
  }

  async create(
    dto: CreateAccessRequestDto,
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    if (dto.companyWebsite?.trim()) {
      return PUBLIC_SUCCESS;
    }

    const pharmacyName = dto.pharmacyName.trim();
    const licenceNumber = normalizeLicenceNumber(dto.licenceNumber);
    const contactName = dto.contactName.trim();
    const email = normalizeAccessEmail(dto.email);
    const phoneRaw = dto.phone?.trim() || '';
    if (!isValidOptionalPhone(phoneRaw)) {
      throw new BadRequestException('Please enter a valid phone number.');
    }
    const phone = normalizeAccessPhone(phoneRaw);

    const captured = await this.readCapture(dto.captureToken);
    const submissionIp = this.requireUsableIp(meta.ipAddress);
    const sameNetwork = capturedNetworksMatch(captured.ip, submissionIp);
    if (!sameNetwork) {
      await this.audit.log({
        action: 'ACCESS_REQUEST_IP_MISMATCH',
        module: 'access_requests',
        ipAddress: submissionIp,
        metadata: { capturedIp: captured.ip, submissionIp },
      });
      throw new NetworkChangedException();
    }

    const existingPending = await this.findRecentPending(email, licenceNumber);
    if (existingPending) {
      return PUBLIC_SUCCESS;
    }

    const match = await this.resolveMatch({ pharmacyName, licenceNumber, email, phone });
    const source = dto.source?.trim() || ACCESS_REQUEST_SOURCES.ALBERTA_QR_LAUNCH;

    const request = await this.prisma.safescribeAccessRequest.create({
      data: {
        pharmacyName,
        licenceNumber,
        province: (dto.province?.trim() || ACCESS_REQUEST_PROVINCE).slice(0, 16),
        contactName,
        email,
        phone,
        capturedPublicIp: captured.ip,
        submissionPublicIp: submissionIp,
        ipDiscrepancy: false,
        status: ACCESS_REQUEST_STATUSES.PENDING,
        source: source.slice(0, 64),
        matchType: match.matchType,
        matchConfidence: match.confidence ?? null,
        matchReasons: match.reasons,
        utmSource: sanitizeUtm(dto.utmSource),
        utmMedium: sanitizeUtm(dto.utmMedium),
        utmCampaign: sanitizeUtm(dto.utmCampaign),
        userAgent: meta.userAgent?.slice(0, ACCESS_REQUEST_LIMITS.USER_AGENT),
        matchedPharmacyId: match.pharmacyId ?? null,
      },
    });

    await this.audit.log({
      action: 'ACCESS_REQUEST_SUBMITTED',
      module: 'access_requests',
      ipAddress: submissionIp,
      userAgent: meta.userAgent,
      tenantId: match.pharmacyId ?? null,
      metadata: {
        requestId: request.id,
        source: request.source,
        utmCampaign: request.utmCampaign,
        matchType: match.matchType,
        matchedPharmacyId: match.pharmacyId ?? null,
      },
    });

    const content = {
      pharmacyName,
      licenceNumber,
      contactName,
      email,
      phone,
      capturedPublicIp: captured.ip,
      sourceLabel: accessRequestSourceLabel(request.source, {
        source: request.utmSource,
        medium: request.utmMedium,
      }),
    };
    const to = this.config.get<string>('CONTACT_TO_EMAIL', CONTACT_SUPPORT_EMAIL);
    const notify = accessRequestTeamNotification(content);
    const confirm = accessRequestConfirmation(content);

    const [notified, confirmed] = await Promise.all([
      this.mail.send({
        to,
        replyTo: email,
        subject: notify.subject,
        text: notify.text,
        html: notify.html,
        idempotencyKey: `access-notify-${request.id}`,
        tags: [{ name: 'category', value: 'access_request_notify' }],
      }),
      this.mail.send({
        to: email,
        replyTo: to,
        subject: confirm.subject,
        text: confirm.text,
        html: confirm.html,
        idempotencyKey: `access-confirm-${request.id}`,
        tags: [{ name: 'category', value: 'access_request_confirm' }],
      }),
    ]);

    if (!notified) {
      this.logger.error(`Access request ${request.id} saved but the team notification email was not sent`);
    }
    if (!confirmed) {
      this.logger.warn(`Access request ${request.id} saved but the confirmation email was not sent`);
    }

    return PUBLIC_SUCCESS;
  }

  async list(query: ListAccessRequestsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const where = buildAccessRequestWhere(query);

    const [rows, total, tabCounts, summary] = await Promise.all([
      this.prisma.safescribeAccessRequest.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          matchedPharmacy: { select: pharmacyListSelect },
          pharmacy: { select: pharmacyListSelect },
        },
      }),
      this.prisma.safescribeAccessRequest.count({ where }),
      this.tabCounts(),
      this.summary(),
    ]);

    return {
      data: rows.map((row) => this.formatListItem(row)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      counts: tabCounts,
      summary,
    };
  }

  async summary() {
    const today = usagePeriodWindow(new Date(), DEFAULT_PHARMACY_TIMEZONE, ENTITLEMENT_PERIODS.DAILY);
    const [
      pendingReview,
      existingMatches,
      activatedToday,
      newPharmaciesActivated,
      rejected,
      needsReview,
      all,
      tabCounts,
    ] = await Promise.all([
      this.prisma.safescribeAccessRequest.count({
        where: buildAccessRequestWhere({ tab: ACCESS_REQUEST_TABS.PENDING }),
      }),
      this.prisma.safescribeAccessRequest.count({
        where: buildAccessRequestWhere({ tab: ACCESS_REQUEST_TABS.EXISTING }),
      }),
      this.prisma.safescribeAccessRequest.count({
        where: {
          status: ACCESS_REQUEST_STATUSES.APPROVED,
          approvedAt: { gte: today.start, lt: today.end },
        },
      }),
      this.prisma.safescribeAccessRequest.count({
        where: {
          status: ACCESS_REQUEST_STATUSES.APPROVED,
          matchType: ACCESS_REQUEST_MATCH_TYPES.NONE,
        },
      }),
      this.prisma.safescribeAccessRequest.count({
        where: { status: ACCESS_REQUEST_STATUSES.REJECTED },
      }),
      this.prisma.safescribeAccessRequest.count({
        where: { status: ACCESS_REQUEST_STATUSES.NEEDS_REVIEW },
      }),
      this.prisma.safescribeAccessRequest.count(),
      this.tabCounts(),
    ]);

    return {
      pendingReview,
      existingMatches,
      activatedToday,
      newPharmaciesActivated,
      rejected,
      needsReview,
      all,
      navBadge: pendingReview,
      tabs: tabCounts,
    };
  }

  async exportCsv(query: ListAccessRequestsQueryDto) {
    const where = buildAccessRequestWhere(query);
    const rows = await this.prisma.safescribeAccessRequest.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      take: 5000,
      include: {
        matchedPharmacy: { select: pharmacyListSelect },
        pharmacy: { select: pharmacyListSelect },
        reviewedBy: { select: reviewedBySelect },
      },
    });

    const headers = [
      'Request ID',
      'Submitted',
      'Status',
      'Match type',
      'Pharmacy name',
      'Licence number',
      'Province',
      'Contact',
      'Email',
      'Phone',
      'Source',
      'Captured IP',
      'Matched pharmacy',
      'Linked pharmacy',
      'Reviewed by',
      'Notes',
    ];
    const csvRows = rows.map((row) =>
      toCsvRow([
        formatAccessRequestId(row.requestNumber),
        row.submittedAt.toISOString(),
        accessRequestDisplayStatus({ status: row.status, matchType: row.matchType }),
        accessRequestMatchLabel(row.matchType),
        row.pharmacyName,
        row.licenceNumber,
        row.province,
        row.contactName,
        row.email,
        row.phone,
        accessRequestSourceLabel(row.source, { source: row.utmSource, medium: row.utmMedium }),
        row.capturedPublicIp,
        row.matchedPharmacy?.name,
        row.pharmacy?.name,
        row.reviewedBy ? `${row.reviewedBy.firstName} ${row.reviewedBy.lastName}` : '',
        row.notes,
      ]),
    );
    return [headers.map((h) => `"${h}"`).join(','), ...csvRows].join('\n');
  }

  async findById(id: string) {
    const request = await this.loadDetail(id);
    if (!request) throw new NotFoundException('Access request not found');
    return this.formatDetail(request);
  }

  async recheckMatch(id: string, actor: RequestUser) {
    const existing = await this.requireOpenRequest(id);
    const match = await this.resolveMatch({
      pharmacyName: existing.pharmacyName,
      licenceNumber: existing.licenceNumber,
      email: existing.email,
      phone: existing.phone,
    });
    const updated = await this.prisma.safescribeAccessRequest.update({
      where: { id },
      data: {
        matchType: match.matchType,
        matchConfidence: match.confidence ?? null,
        matchReasons: match.reasons,
        matchedPharmacyId: match.pharmacyId ?? null,
      },
    });
    await this.audit.log({
      userId: actor.id,
      tenantId: match.pharmacyId ?? null,
      action: 'ACCESS_REQUEST_MATCH_CHECKED',
      module: 'access_requests',
      metadata: { requestId: updated.id, matchType: match.matchType, matchedPharmacyId: match.pharmacyId ?? null },
    });
    return this.findById(id);
  }

  async saveNotes(id: string, notes: string, actor: RequestUser) {
    const existing = await this.prisma.safescribeAccessRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Access request not found');
    await this.prisma.safescribeAccessRequest.update({
      where: { id },
      data: { notes: notes.trim().slice(0, ACCESS_REQUEST_LIMITS.NOTES) },
    });
    await this.audit.log({
      userId: actor.id,
      tenantId: existing.pharmacyId,
      action: 'ACCESS_REQUEST_REVIEWED',
      module: 'access_requests',
      metadata: { requestId: id, notesSaved: true },
    });
    return this.findById(id);
  }

  async markNeedsReview(id: string, notes: string | undefined, actor: RequestUser) {
    const existing = await this.requireOpenRequest(id);
    const updated = await this.prisma.safescribeAccessRequest.update({
      where: { id },
      data: {
        status: ACCESS_REQUEST_STATUSES.NEEDS_REVIEW,
        notes: notes?.trim() || existing.notes,
        reviewedAt: new Date(),
        reviewedById: actor.id,
      },
    });
    await this.audit.log({
      userId: actor.id,
      tenantId: updated.pharmacyId,
      action: 'ACCESS_REQUEST_REVIEWED',
      module: 'access_requests',
      previousValue: { status: existing.status },
      newValue: { status: updated.status },
      metadata: { requestId: updated.id },
    });
    return this.findById(id);
  }

  async reject(id: string, dto: RejectAccessRequestDto = {}, actor: RequestUser) {
    const existing = await this.requireOpenRequest(id);
    const now = new Date();
    const updated = await this.prisma.safescribeAccessRequest.update({
      where: { id },
      data: {
        status: ACCESS_REQUEST_STATUSES.REJECTED,
        rejectReason: dto.reason?.trim().slice(0, ACCESS_REQUEST_LIMITS.REJECT_REASON) || null,
        notes: dto.notes?.trim() || existing.notes,
        reviewedAt: now,
        rejectedAt: now,
        reviewedById: actor.id,
      },
    });
    await this.audit.log({
      userId: actor.id,
      tenantId: updated.pharmacyId,
      action: 'ACCESS_REQUEST_REJECTED',
      module: 'access_requests',
      previousValue: { status: existing.status },
      newValue: { status: updated.status, rejectReason: updated.rejectReason },
      metadata: { requestId: updated.id },
    });
    return this.findById(id);
  }

  async approveNew(id: string, dto: ApproveAccessRequestDto = {}, actor: RequestUser) {
    const existing = await this.loadForActivation(id);
    if (existing.status === ACCESS_REQUEST_STATUSES.APPROVED) {
      return this.findById(id);
    }
    this.assertCanReview(existing);

    const match = await this.resolveMatch({
      pharmacyName: existing.pharmacyName,
      licenceNumber: existing.licenceNumber,
      email: existing.email,
      phone: existing.phone,
    });

    if (isExactPharmacyMatch(match.matchType) && !dto.forceCreate) {
      throw new ConflictException({
        code: ACCESS_REQUEST_ERRORS.EXACT_MATCH_EXISTS,
        message:
          'An existing pharmacy already matches this Alberta licence number. Link the existing pharmacy instead of creating a new one.',
      });
    }
    if (match.matchType === ACCESS_REQUEST_MATCH_TYPES.POSSIBLE && !dto.forceCreate) {
      throw new BadRequestException(
        'A possible existing pharmacy was found. Link to the existing pharmacy or confirm create as new.',
      );
    }

    const notes = dto.notes?.trim() || existing.notes;
    const result = await this.prisma.$transaction(async (tx) => {
      const pharmacy = await this.createPharmacyTx(tx, existing);
      const invited = await this.ensureContactUserTx(tx, {
        tenantId: pharmacy.id,
        contactName: existing.contactName,
        email: existing.email,
        isNewPharmacy: true,
      });
      await this.ensurePrescribeTx(tx, pharmacy.id);
      await this.ensureNetworkTx(tx, pharmacy.id, existing.capturedPublicIp, actor.id);
      const now = new Date();
      await tx.safescribeAccessRequest.update({
        where: { id: existing.id },
        data: {
          status: ACCESS_REQUEST_STATUSES.APPROVED,
          notes,
          pharmacyId: pharmacy.id,
          matchedPharmacyId: match.pharmacyId ?? existing.matchedPharmacyId,
          matchType: match.matchType,
          matchConfidence: match.confidence ?? existing.matchConfidence,
          matchReasons: match.reasons,
          reviewedAt: now,
          approvedAt: now,
          reviewedById: actor.id,
        },
      });
      return { pharmacyId: pharmacy.id, inviteUserId: invited.created ? invited.user.id : null };
    });

    await this.finishActivation({
      actor,
      requestId: existing.id,
      pharmacyId: result.pharmacyId,
      previousStatus: existing.status,
      action: 'PHARMACY_CREATED_FROM_ACCESS_REQUEST',
      inviteUserId: result.inviteUserId,
      contactName: existing.contactName,
      email: existing.email,
      pharmacyName: existing.pharmacyName,
      capturedPublicIp: existing.capturedPublicIp,
    });

    return this.findById(id);
  }

  async linkExisting(id: string, dto: LinkExistingAccessRequestDto = {}, actor: RequestUser) {
    const existing = await this.loadForActivation(id);
    if (existing.status === ACCESS_REQUEST_STATUSES.APPROVED) {
      return this.findById(id);
    }
    this.assertCanReview(existing);

    const match = await this.resolveMatch({
      pharmacyName: existing.pharmacyName,
      licenceNumber: existing.licenceNumber,
      email: existing.email,
      phone: existing.phone,
    });
    const pharmacyId = dto.pharmacyId?.trim() || match.pharmacyId || existing.matchedPharmacyId;
    if (!pharmacyId) {
      throw new BadRequestException('Select an existing pharmacy to link this request.');
    }
    const pharmacy = await this.prisma.tenant.findUnique({ where: { id: pharmacyId } });
    if (!pharmacy) throw new NotFoundException('Existing pharmacy not found');

    const notes = dto.notes?.trim() || existing.notes;
    const result = await this.prisma.$transaction(async (tx) => {
      if (!pharmacy.pharmacyLicenseNumber && existing.licenceNumber) {
        await tx.tenant.update({
          where: { id: pharmacy.id },
          data: { pharmacyLicenseNumber: existing.licenceNumber },
        });
      }
      if (!pharmacy.phone && existing.phone) {
        await tx.tenant.update({
          where: { id: pharmacy.id },
          data: { phone: existing.phone },
        });
      }
      const invited = await this.ensureContactUserTx(tx, {
        tenantId: pharmacy.id,
        contactName: existing.contactName,
        email: existing.email,
        isNewPharmacy: false,
      });
      await this.ensurePrescribeTx(tx, pharmacy.id);
      await this.ensureNetworkTx(tx, pharmacy.id, existing.capturedPublicIp, actor.id);
      const now = new Date();
      await tx.safescribeAccessRequest.update({
        where: { id: existing.id },
        data: {
          status: ACCESS_REQUEST_STATUSES.APPROVED,
          notes,
          pharmacyId: pharmacy.id,
          matchedPharmacyId: pharmacy.id,
          matchType: match.matchType === ACCESS_REQUEST_MATCH_TYPES.NONE
            ? ACCESS_REQUEST_MATCH_TYPES.SAFESCRIBE_EXACT
            : match.matchType,
          matchConfidence: match.confidence ?? existing.matchConfidence,
          matchReasons: match.reasons.length ? match.reasons : existing.matchReasons ?? undefined,
          reviewedAt: now,
          approvedAt: now,
          reviewedById: actor.id,
        },
      });
      return { pharmacyId: pharmacy.id, inviteUserId: invited.created ? invited.user.id : null };
    });

    await this.finishActivation({
      actor,
      requestId: existing.id,
      pharmacyId: result.pharmacyId,
      previousStatus: existing.status,
      action: 'ACCESS_REQUEST_LINKED_TO_EXISTING_PHARMACY',
      inviteUserId: result.inviteUserId,
      contactName: existing.contactName,
      email: existing.email,
      pharmacyName: pharmacy.name,
      capturedPublicIp: existing.capturedPublicIp,
    });

    return this.findById(id);
  }

  private async finishActivation(input: {
    actor: RequestUser;
    requestId: string;
    pharmacyId: string;
    previousStatus: string;
    action: string;
    inviteUserId: string | null;
    contactName: string;
    email: string;
    pharmacyName: string;
    capturedPublicIp: string;
  }) {
    try {
      await this.ipAccess.addLaunchCapturedNetwork({
        tenantId: input.pharmacyId,
        ipAddress: input.capturedPublicIp,
        approvedById: input.actor.id,
        source: PharmacyNetworkSource.ALBERTA_LAUNCH,
      });
    } catch (err) {
      this.logger.error(
        `Access request ${input.requestId} approved but network cache refresh failed`,
        err instanceof Error ? err.stack : String(err),
      );
    }

    await this.audit.log({
      userId: input.actor.id,
      tenantId: input.pharmacyId,
      action: 'ACCESS_REQUEST_APPROVED',
      module: 'access_requests',
      previousValue: { status: input.previousStatus },
      newValue: { status: ACCESS_REQUEST_STATUSES.APPROVED, pharmacyId: input.pharmacyId },
      metadata: { requestId: input.requestId, activation: input.action },
    });
    await this.audit.log({
      userId: input.actor.id,
      tenantId: input.pharmacyId,
      action: input.action,
      module: 'access_requests',
      metadata: { requestId: input.requestId },
    });

    if (input.inviteUserId) {
      await this.sendInvite(input.inviteUserId, {
        contactName: input.contactName,
        email: input.email,
        pharmacyName: input.pharmacyName,
        requestId: input.requestId,
        actorId: input.actor.id,
        pharmacyId: input.pharmacyId,
      });
    }
  }

  private async sendInvite(
    userId: string,
    input: {
      contactName: string;
      email: string;
      pharmacyName: string;
      requestId: string;
      actorId: string;
      pharmacyId: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.phixUserId) return;

    const token = randomUUID();
    await this.prisma.passwordReset.create({
      data: {
        userId,
        token,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    const inviteUrl = `${this.webUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    const message = accessRequestInvite({
      contactName: input.contactName,
      pharmacyName: input.pharmacyName,
      inviteUrl,
    });
    const sent = await this.mail.send({
      to: input.email,
      subject: message.subject,
      text: message.text,
      html: message.html,
      idempotencyKey: `access-invite-${input.requestId}-${userId}`,
      tags: [{ name: 'category', value: 'access_request_invite' }],
    });
    await this.audit.log({
      userId: input.actorId,
      tenantId: input.pharmacyId,
      action: 'USER_INVITED_FROM_ACCESS_REQUEST',
      module: 'access_requests',
      metadata: { requestId: input.requestId, invitedUserId: userId, emailed: sent },
    });
    if (!sent) {
      this.logger.warn(`Invite email was not sent for access request ${input.requestId}`);
    }
  }

  private webUrl() {
    const fromEmail = this.config.get<string>('EMAIL_APP_URL')?.trim();
    const fromWeb = this.config.get<string>('WEB_URL')?.trim();
    return (fromEmail || fromWeb || 'http://localhost:3000').replace(/\/$/, '');
  }

  private async createPharmacyTx(tx: Tx, existing: { pharmacyName: string; licenceNumber: string; phone: string | null }) {
    let slug = slugifyPharmacyName(existing.pharmacyName, existing.licenceNumber || 'launch');
    const taken = await tx.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (taken) {
      slug = slugifyPharmacyName(existing.pharmacyName, `${existing.licenceNumber || 'launch'}${Date.now().toString(36)}`);
    }
    return tx.tenant.create({
      data: {
        name: existing.pharmacyName,
        slug,
        phone: existing.phone,
        pharmacyLicenseNumber: existing.licenceNumber,
        timezone: DEFAULT_PHARMACY_TIMEZONE,
        networkAccessEnabled: true,
      },
    });
  }

  private async ensureContactUserTx(
    tx: Tx,
    input: { tenantId: string; contactName: string; email: string; isNewPharmacy: boolean },
  ) {
    const existing = await tx.user.findFirst({
      where: { tenantId: input.tenantId, email: input.email, deletedAt: null },
    });
    if (existing) {
      return { user: existing, created: false };
    }

    const adminCount = await tx.user.count({
      where: { tenantId: input.tenantId, deletedAt: null, role: { name: ROLES.PHARMACIST_ADMIN } },
    });
    const roleName =
      input.isNewPharmacy || adminCount === 0 ? ROLES.PHARMACIST_ADMIN : ROLES.PHARMACIST;
    const role = await tx.role.findUnique({ where: { name: roleName } });
    if (!role) throw new BadRequestException('Required user role is not configured');

    const { firstName, lastName } = splitDisplayName(input.contactName);
    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash: await argon2.hash(randomBytes(32).toString('hex')),
        firstName,
        lastName,
        tenantId: input.tenantId,
        roleId: role.id,
        status: UserStatus.PENDING,
      },
    });
    return { user, created: true };
  }

  private async ensurePrescribeTx(tx: Tx, tenantId: string) {
    await tx.safeScribeEntitlement.upsert({
      where: { tenantId_module: { tenantId, module: PRESCRIBE } },
      create: {
        tenantId,
        module: PRESCRIBE,
        includedQuantity: DEFAULT_PRESCRIBE_DAILY_INCLUDED,
        period: ENTITLEMENT_PERIODS.DAILY,
        active: true,
      },
      update: { active: true },
    });
  }

  private async ensureNetworkTx(tx: Tx, tenantId: string, ipAddress: string, actorId: string) {
    const stabilized = stabilizeAllowlistCidr(ipAddress);
    const existing = await tx.pharmacyNetwork.findFirst({
      where: {
        tenantId,
        status: { not: PharmacyNetworkStatus.DISABLED },
        OR: [{ ipAddress: stabilized.ipAddress }, { cidr: stabilized.cidr }],
      },
    });
    if (existing) {
      await tx.pharmacyNetwork.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date(), lastVerifiedAt: new Date() },
      });
      return existing;
    }
    return tx.pharmacyNetwork.create({
      data: {
        tenantId,
        ipAddress: stabilized.ipAddress,
        cidr: stabilized.cidr,
        label: 'Alberta launch — captured pharmacy network',
        status: PharmacyNetworkStatus.APPROVED,
        source: PharmacyNetworkSource.ALBERTA_LAUNCH,
        createdById: actorId,
        approvedById: actorId,
        approvedAt: new Date(),
        lastSeenAt: new Date(),
        lastVerifiedAt: new Date(),
      },
    });
  }

  private async resolveMatch(input: {
    pharmacyName: string;
    licenceNumber: string;
    email: string;
    phone: string | null;
  }): Promise<PharmacyMatchResult> {
    const candidates = await this.loadMatchCandidates();
    return findExistingPharmacyMatch({ ...input, candidates });
  }

  private async loadMatchCandidates(): Promise<PharmacyMatchCandidate[]> {
    const tenants = await this.prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        pharmacyLicenseNumber: true,
        phone: true,
        phixCustomer: true,
        users: { where: { deletedAt: null }, select: { email: true } },
      },
    });
    return tenants.map((row) => ({
      id: row.id,
      name: row.name,
      pharmacyLicenseNumber: row.pharmacyLicenseNumber,
      phone: row.phone,
      phixCustomer: row.phixCustomer,
      emails: row.users.map((user) => user.email),
    }));
  }

  private async findRecentPending(email: string, licenceNumber: string) {
    const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);
    const rows = await this.prisma.safescribeAccessRequest.findMany({
      where: {
        email,
        status: ACCESS_REQUEST_STATUSES.PENDING,
        submittedAt: { gte: since },
      },
      orderBy: { submittedAt: 'desc' },
      take: 10,
    });
    return rows.find((row) => licenceNumbersMatch(row.licenceNumber, licenceNumber)) ?? null;
  }

  private async readCapture(token: string): Promise<CaptureRecord> {
    const raw = await this.redis.get(accessCaptureKey(token.trim()));
    if (!raw) {
      throw new BadRequestException(
        'Please capture your pharmacy network before requesting access.',
      );
    }
    try {
      const parsed = JSON.parse(raw) as CaptureRecord;
      if (!parsed?.ip) throw new Error('invalid');
      this.requireUsableIp(parsed.ip);
      return parsed;
    } catch (err) {
      if (err instanceof NetworkUnavailableException || err instanceof BadRequestException) {
        throw err;
      }
      throw new BadRequestException(
        'Please capture your pharmacy network before requesting access.',
      );
    }
  }

  private requireUsableIp(ipAddress: string | undefined): string {
    const ip = ipAddress?.trim();
    if (!ip) throw new NetworkUnavailableException();
    const production = this.config.get('NODE_ENV') === 'production';
    if (production && !isUsablePublicClientIp(ip)) {
      throw new NetworkUnavailableException();
    }
    return ip;
  }

  private async tabCounts() {
    const [all, pending, neu, existing, activated, rejected] = await Promise.all([
      this.prisma.safescribeAccessRequest.count(),
      this.prisma.safescribeAccessRequest.count({
        where: buildAccessRequestWhere({ tab: ACCESS_REQUEST_TABS.PENDING }),
      }),
      this.prisma.safescribeAccessRequest.count({
        where: buildAccessRequestWhere({ tab: ACCESS_REQUEST_TABS.NEW }),
      }),
      this.prisma.safescribeAccessRequest.count({
        where: buildAccessRequestWhere({ tab: ACCESS_REQUEST_TABS.EXISTING }),
      }),
      this.prisma.safescribeAccessRequest.count({
        where: buildAccessRequestWhere({ tab: ACCESS_REQUEST_TABS.ACTIVATED }),
      }),
      this.prisma.safescribeAccessRequest.count({
        where: buildAccessRequestWhere({ tab: ACCESS_REQUEST_TABS.REJECTED }),
      }),
    ]);
    return { all, pending, new: neu, existing, activated, rejected };
  }

  private async loadDetail(id: string) {
    return this.prisma.safescribeAccessRequest.findUnique({
      where: { id },
      include: {
        matchedPharmacy: { select: pharmacyDetailSelect },
        pharmacy: { select: pharmacyDetailSelect },
        reviewedBy: { select: reviewedBySelect },
      },
    });
  }

  private async loadForActivation(id: string) {
    const existing = await this.prisma.safescribeAccessRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Access request not found');
    return existing;
  }

  private async requireOpenRequest(id: string) {
    const existing = await this.loadForActivation(id);
    this.assertCanReview(existing);
    return existing;
  }

  private assertCanReview(existing: { status: string }) {
    if (existing.status === ACCESS_REQUEST_STATUSES.APPROVED) {
      throw new BadRequestException('Approved requests cannot be changed.');
    }
    if (existing.status === ACCESS_REQUEST_STATUSES.REJECTED) {
      throw new BadRequestException('Rejected requests cannot be changed.');
    }
  }

  private matchReasons(value: Prisma.JsonValue | null | undefined): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
  }

  private formatPharmacySnapshot(
    row:
      | {
          id: string;
          name: string;
          slug: string;
          pharmacyLicenseNumber: string | null;
          phone?: string | null;
          phixCustomer: boolean;
          status: string;
          timezone?: string;
          _count?: { users: number };
          entitlements?: Array<{ active: boolean; includedQuantity: number | null; period: string }>;
          pharmacyNetworks?: Array<{
            id: string;
            ipAddress: string;
            cidr: string;
            label: string | null;
            status: string;
            source: string;
          }>;
          users?: Array<{
            id: string;
            firstName: string;
            lastName: string;
            email: string;
            status: string;
            role: { name: string; displayName: string };
          }>;
        }
      | null,
  ) {
    if (!row) return null;
    const prescribe = row.entitlements?.[0];
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      licenceNumber: row.pharmacyLicenseNumber,
      phone: row.phone ?? null,
      phixCustomer: row.phixCustomer,
      status: row.status,
      timezone: row.timezone ?? DEFAULT_PHARMACY_TIMEZONE,
      userCount: row._count?.users ?? row.users?.length ?? 0,
      prescribeActive: Boolean(prescribe?.active),
      prescribeIncluded: prescribe?.includedQuantity ?? null,
      networks: row.pharmacyNetworks ?? [],
      users: (row.users ?? []).map((user) => ({
        id: user.id,
        fullName: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        status: user.status,
        role: user.role.displayName || user.role.name,
      })),
    };
  }

  private formatListItem(row: {
    id: string;
    requestNumber: number;
    pharmacyName: string;
    licenceNumber: string;
    province: string;
    contactName: string;
    email: string;
    phone: string | null;
    capturedPublicIp: string;
    status: string;
    source: string;
    matchType: string;
    utmSource: string | null;
    utmMedium: string | null;
    submittedAt: Date;
    matchedPharmacy: { id: string; name: string; phixCustomer: boolean } | null;
    pharmacy: { id: string; name: string } | null;
  }) {
    const matchType = row.matchType as AccessRequestMatchType;
    return {
      id: row.id,
      requestNumber: row.requestNumber,
      requestId: formatAccessRequestId(row.requestNumber),
      pharmacyName: row.pharmacyName,
      licenceNumber: row.licenceNumber,
      province: row.province,
      contactName: row.contactName,
      email: row.email,
      phone: row.phone,
      capturedPublicIp: row.capturedPublicIp,
      status: row.status as AccessRequestStatus,
      displayStatus: accessRequestDisplayStatus({ status: row.status, matchType }),
      matchType,
      matchLabel: accessRequestMatchLabel(matchType),
      source: row.source,
      sourceLabel: accessRequestSourceLabel(row.source, {
        source: row.utmSource,
        medium: row.utmMedium,
      }),
      submittedAt: row.submittedAt,
      possibleDuplicate: Boolean(row.matchedPharmacy) || isExactPharmacyMatch(matchType),
      matchedPharmacyId: row.matchedPharmacy?.id ?? null,
      matchedPharmacyName: row.matchedPharmacy?.name ?? null,
      pharmacyId: row.pharmacy?.id ?? null,
      pharmacyNameLinked: row.pharmacy?.name ?? null,
      preview: this.preview(`${row.contactName} · ${row.email}`),
    };
  }

  private formatDetail(
    row: NonNullable<Awaited<ReturnType<AccessRequestsService['loadDetail']>>>,
  ) {
    const matchType = row.matchType as AccessRequestMatchType;
    const matchedPharmacy = this.formatPharmacySnapshot(row.matchedPharmacy);
    const pharmacy = this.formatPharmacySnapshot(row.pharmacy);
    return {
      id: row.id,
      requestNumber: row.requestNumber,
      requestId: formatAccessRequestId(row.requestNumber),
      pharmacyName: row.pharmacyName,
      licenceNumber: row.licenceNumber,
      province: row.province,
      contactName: row.contactName,
      email: row.email,
      phone: row.phone,
      capturedPublicIp: row.capturedPublicIp,
      submissionPublicIp: row.submissionPublicIp,
      ipDiscrepancy: row.ipDiscrepancy,
      status: row.status as AccessRequestStatus,
      displayStatus: accessRequestDisplayStatus({ status: row.status, matchType }),
      matchType,
      matchLabel: accessRequestMatchLabel(matchType),
      matchConfidence: row.matchConfidence,
      matchReasons: this.matchReasons(row.matchReasons),
      rejectReason: row.rejectReason,
      source: row.source,
      sourceLabel: accessRequestSourceLabel(row.source, {
        source: row.utmSource,
        medium: row.utmMedium,
      }),
      utmSource: row.utmSource,
      utmMedium: row.utmMedium,
      utmCampaign: row.utmCampaign,
      userAgent: row.userAgent,
      notes: row.notes,
      submittedAt: row.submittedAt,
      reviewedAt: row.reviewedAt,
      approvedAt: row.approvedAt,
      rejectedAt: row.rejectedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      possibleDuplicate: Boolean(row.matchedPharmacy) || isExactPharmacyMatch(matchType),
      matchedPharmacy,
      pharmacy,
      reviewedBy: row.reviewedBy
        ? {
            id: row.reviewedBy.id,
            fullName: `${row.reviewedBy.firstName} ${row.reviewedBy.lastName}`,
          }
        : null,
      activity: this.activity(row),
    };
  }

  private activity(row: {
    submittedAt: Date;
    reviewedAt: Date | null;
    approvedAt: Date | null;
    rejectedAt: Date | null;
    matchType: string;
    pharmacyId: string | null;
    notes: string | null;
  }) {
    const events: Array<{ at: Date; label: string }> = [
      { at: row.submittedAt, label: 'Request submitted' },
      { at: row.submittedAt, label: 'Pharmacy network captured' },
      { at: row.submittedAt, label: 'Existing pharmacy check completed' },
    ];
    if (row.notes) events.push({ at: row.reviewedAt ?? row.submittedAt, label: 'Admin note added' });
    if (row.reviewedAt) events.push({ at: row.reviewedAt, label: 'Admin reviewed request' });
    if (row.approvedAt) {
      events.push({
        at: row.approvedAt,
        label: row.pharmacyId ? 'Request approved and pharmacy linked' : 'Request approved',
      });
    }
    if (row.rejectedAt) events.push({ at: row.rejectedAt, label: 'Request rejected' });
    return events.sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  private preview(value: string) {
    const compact = value.replace(/\s+/g, ' ').trim();
    if (compact.length <= PREVIEW_LEN) return compact;
    return `${compact.slice(0, PREVIEW_LEN - 1).trimEnd()}…`;
  }
}
