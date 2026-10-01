import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import {
  isPathwayEnabledForProvince,
  matchSingleApprovedPathway,
  normalizeProvinceCode,
  parsePathwayGovernance,
  parsePresentationReviewState,
  pathwayDisplayLabel,
  provinceFromTimezone,
  type PathwayMatchStatus,
} from '@safescript/shared';
import {
  independentPeerReviewCopy,
  independentPeerReviewStatus,
  isClinicalAssessmentEvent,
  isIndependentReviewDocument,
  parseGuidelineSources,
  type ClinicalAssessmentEvent,
} from './clinical-assessment.helpers';

const PROVINCE_LABEL: Record<string, string> = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia',
  NT: 'Northwest Territories',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Prince Edward Island',
  QC: 'Quebec',
  SK: 'Saskatchewan',
  YT: 'Yukon',
};

export type PathwayReviewer = {
  fullName: string;
  credentials: string | null;
  role: string;
  reviewerType: 'internal_clinical_review' | 'independent_external_peer_review';
  reviewedAt?: string | null;
};

export type PathwayReferenceDto = {
  id: string;
  citationTitle: string;
  organization?: string | null;
  publicationYear?: number | null;
  edition?: string | null;
  url?: string | null;
  referenceType: string;
  supportsSections: string[];
};

export type PathwayDocumentationReferenceDto = {
  id: string;
  citationTitle: string;
  publicationYear?: number | null;
  edition?: string | null;
};

export type PathwayEvidenceDto = {
  pathwayId: string;
  displayName: string;
  jurisdiction: string;
  pathwayVersion: string;
  effectiveDate: string | null;
  clinicalSources: string[];
  clinicalReview: {
    status: 'completed' | 'pending';
    summary: string;
    lastReviewed: string | null;
    reviewers: PathwayReviewer[];
  };
  independentPeerReview: {
    status: 'completed' | 'pending' | 'not_completed';
    summary: string;
    reviewers: PathwayReviewer[];
  };
  references: PathwayReferenceDto[];
  primaryReference: PathwayDocumentationReferenceDto | null;
  secondaryReference: PathwayDocumentationReferenceDto | null;
  versionHistory: Array<{
    version: string;
    effectiveDate: string | null;
    changeSummary: string[];
  }>;
};

@Injectable()
export class ClinicalAssessmentService {
  private readonly logger = new Logger(ClinicalAssessmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async match(
    id: string,
    user: RequestUser,
    body: { assessmentText?: string },
    req?: Request,
  ) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);
    const assessmentText = (body.assessmentText ?? '').trim();
    const province = await this.resolveProvince(consultation, user);

    const published = await this.prisma.clinicalPathway.findMany({
      where: {
        status: 'PUBLISHED',
        deletedAt: null,
        ...(user.tenantId ? { OR: [{ tenantId: user.tenantId }, { tenantId: null }] } : {}),
      },
      select: {
        id: true,
        name: true,
        condition: true,
        category: true,
        description: true,
        aiSummary: true,
        notes: true,
        guidelineSource: true,
        version: true,
        province: true,
        provinceAvailability: true,
        routingAliases: true,
        routingPresentingComplaints: true,
        routingContextTerms: true,
        routingDescription: true,
        differentials: true,
        redFlags: true,
      },
    });
    const pathways = published.filter((pathway) =>
      isPathwayEnabledForProvince(pathway, province),
    );
    const match = matchSingleApprovedPathway(assessmentText, pathways);
    const pathwayById = new Map(pathways.map((item) => [item.id, item]));
    const candidateRows = match.candidates
      .map((candidate) => {
        const pathway = pathwayById.get(candidate.pathwayId);
        if (!pathway) return null;
        return {
          id: pathway.id,
          name: pathway.name,
          condition: pathway.condition,
          displayName: pathwayDisplayLabel(pathway),
          version: String(pathway.version),
          matchMethod: candidate.matchMethod,
          score: candidate.score,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const pathway = match.pathwayId
      ? (pathwayById.get(match.pathwayId) ?? null)
      : candidateRows.length === 1
        ? (pathwayById.get(candidateRows[0]!.id) ?? null)
        : null;

    const previous =
      consultation.aiAnalysis && typeof consultation.aiAnalysis === 'object'
        ? (consultation.aiAnalysis as Record<string, unknown>)
        : {};
    const existing =
      previous.clinicalAssessment && typeof previous.clinicalAssessment === 'object'
        ? (previous.clinicalAssessment as Record<string, unknown>)
        : {};
    await this.prisma.consultation.update({
      where: { id },
      data: {
        aiAnalysis: {
          ...previous,
          clinicalAssessment: {
            ...existing,
            assessmentText,
            normalizedAssessment: match.normalizedAssessment,
            assessmentSource: 'pharmacist',
            matchedPathwayId: pathway?.id ?? null,
            matchedPathwayVersion: pathway ? String(pathway.version) : null,
            matchMethod: match.matchMethod,
            matchStatus: match.status,
            candidatePathwayIds: candidateRows.map((row) => row.id),
            updatedAt: new Date().toISOString(),
          },
        } as object,
      },
    });

    if (assessmentText.length >= 3) {
      await this.auditSafe(
        user,
        req,
        match.status === 'matched' ? 'PATHWAY_MATCH_FOUND' : 'PATHWAY_MATCH_NOT_FOUND',
        id,
        {
          matchStatus: match.status,
          matchMethod: match.matchMethod,
          pathwayId: pathway?.id ?? null,
          candidateCount: candidateRows.length,
        },
      );
    }

    const evidence = pathway ? await this.buildEvidence(pathway.id, province) : null;

    return {
      status: match.status as PathwayMatchStatus,
      assessmentText,
      normalizedAssessment: match.normalizedAssessment,
      matchMethod: match.matchMethod,
      message:
        match.status === 'ambiguous'
          ? 'Several structured pathways may apply — select one to continue.'
          : match.status === 'none' && assessmentText
            ? 'No structured SafeScribe pathway available'
            : null,
      pathway: pathway
        ? {
            id: pathway.id,
            name: pathway.name,
            condition: pathway.condition,
            displayName: pathwayDisplayLabel(pathway),
            version: String(pathway.version),
          }
        : null,
      candidates: candidateRows,
      evidence,
    };
  }

  async evidence(id: string, pathwayId: string, user: RequestUser, req?: Request) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);
    const province = await this.resolveProvince(consultation, user);
    const evidence = await this.buildEvidence(pathwayId, province);
    if (!evidence) throw new NotFoundException('Pathway not found');
    await this.auditSafe(user, req, 'PATHWAY_EVIDENCE_OPENED', id, {
      pathwayId,
      pathwayVersion: evidence.pathwayVersion,
    });
    return evidence;
  }

  async confirm(
    id: string,
    user: RequestUser,
    body: {
      assessmentText?: string;
      matchedPathwayId?: string | null;
      route: 'structured_pathway' | 'clinical_judgment';
    },
    req?: Request,
  ) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);
    const province = await this.resolveProvince(consultation, user);
    const previous =
      consultation.aiAnalysis && typeof consultation.aiAnalysis === 'object'
        ? (consultation.aiAnalysis as Record<string, unknown>)
        : {};
    const existing =
      previous.clinicalAssessment && typeof previous.clinicalAssessment === 'object'
        ? (previous.clinicalAssessment as Record<string, unknown>)
        : {};
    const evidence =
      body.route === 'structured_pathway' && body.matchedPathwayId
        ? await this.buildEvidence(body.matchedPathwayId, province)
        : null;

    await this.prisma.consultation.update({
      where: { id },
      data: {
        aiAnalysis: {
          ...previous,
          clinicalAssessment: {
            ...existing,
            assessmentText: (body.assessmentText ?? existing.assessmentText ?? '').toString(),
            assessmentSource: 'pharmacist',
            matchedPathwayId: body.matchedPathwayId ?? existing.matchedPathwayId ?? null,
            matchedPathwayVersion: evidence?.pathwayVersion ?? existing.matchedPathwayVersion ?? null,
            routeSelected: body.route,
            selectedBy: 'pharmacist',
            confirmedAt: new Date().toISOString(),
            evidenceSnapshot: evidence ?? existing.evidenceSnapshot ?? null,
            updatedAt: new Date().toISOString(),
          },
        } as object,
      },
    });

    const action: ClinicalAssessmentEvent =
      body.route === 'structured_pathway'
        ? 'STRUCTURED_PATHWAY_SELECTED'
        : 'CLINICAL_JUDGMENT_SELECTED';
    await this.auditSafe(user, req, action, id, {
      route: body.route,
      pathwayId: body.matchedPathwayId ?? null,
      pathwayVersion: evidence?.pathwayVersion ?? null,
    });
    await this.auditSafe(user, req, 'ASSESSMENT_STEP_COMPLETED', id, {
      route: body.route,
    });
    return { ok: true, route: body.route, evidence };
  }

  async recordEvent(
    id: string,
    user: RequestUser,
    body: { event: string; pathwayId?: string; pathwayVersion?: string },
    req?: Request,
  ) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);
    const event = body.event.toUpperCase();
    if (!isClinicalAssessmentEvent(event)) return { ok: false };
    await this.auditSafe(user, req, event, id, {
      pathwayId: body.pathwayId ?? null,
      pathwayVersion: body.pathwayVersion ?? null,
    });
    return { ok: true };
  }

  private async buildEvidence(
    pathwayId: string,
    consultationProvince: string | null,
  ): Promise<PathwayEvidenceDto | null> {
    const pathway = await this.prisma.clinicalPathway.findFirst({
      where: { id: pathwayId, status: 'PUBLISHED', deletedAt: null },
      include: {
        documents: {
          orderBy: { uploadedAt: 'desc' },
          take: 20,
        },
        versions: {
          orderBy: { version: 'desc' },
          take: 8,
        },
        libraryReferences: {
          where: { status: { not: 'archived' } },
          orderBy: { createdAt: 'asc' },
        },
        evidenceMappings: true,
        reviewers: { orderBy: { reviewDate: 'desc' } },
        questions: {
          select: { id: true, evidenceRefIds: true, displayOrder: true },
          orderBy: { displayOrder: 'asc' },
        },
      },
    });
    if (!pathway) return null;

    const reviewerUser = pathway.clinicallyReviewedById
      ? await this.prisma.user.findUnique({
          where: { id: pathway.clinicallyReviewedById },
          select: { firstName: true, lastName: true, role: { select: { name: true } } },
        })
      : null;

    const jurisdictionCode = (consultationProvince || pathway.province || '').trim().toUpperCase();
    const jurisdiction = PROVINCE_LABEL[jurisdictionCode] || pathway.province || 'Not specified';
    const lastReviewed = pathway.lastClinicalReview ?? pathway.clinicallyReviewedAt;
    const governance = parsePathwayGovernance(
      pathway.governance,
      pathway.primaryDocumentationReferenceId,
      pathway.secondaryDocumentationReferenceId,
    );
    const clinicalReviewCompleted =
      governance.internalReviewStatus === 'completed' || Boolean(lastReviewed);
    const sources = parseGuidelineSources(pathway.guidelineSource).length
      ? parseGuidelineSources(pathway.guidelineSource)
      : this.sourcesFromDocuments(pathway.documents);

    const governanceInternal = pathway.reviewers
      .filter((r) => r.reviewerType === 'internal')
      .map((r) =>
        this.toReviewer(`${r.name}${r.credentials ? `, ${r.credentials}` : ''}`, {
          role: r.role,
          reviewerType: 'internal_clinical_review',
          reviewedAt: r.reviewDate.toISOString(),
        }),
      );

    const internalReviewers: PathwayReviewer[] =
      governanceInternal.length > 0
        ? governanceInternal
        : reviewerUser
          ? [
              this.toReviewer(`${reviewerUser.firstName} ${reviewerUser.lastName}`.trim(), {
                role:
                  reviewerUser.role?.name === 'PHARMACIST_ADMIN'
                    ? 'Pharmacist Reviewer'
                    : 'Clinical Reviewer',
                reviewerType: 'internal_clinical_review',
                reviewedAt: lastReviewed?.toISOString() ?? null,
              }),
            ]
          : [];

    const governanceExternal = pathway.reviewers
      .filter((r) => r.reviewerType === 'external')
      .map((r) =>
        this.toReviewer(
          `${r.name}${r.credentials ? `, ${r.credentials}` : ''}${
            r.organization ? ` (${r.organization})` : ''
          }`,
          {
            role: r.role || 'Independent External Reviewer',
            reviewerType: 'independent_external_peer_review',
            reviewedAt: r.reviewDate.toISOString(),
          },
        ),
      );

    const independentDocs = pathway.documents.filter(isIndependentReviewDocument);
    const independentStatus =
      governance.externalPeerReviewStatus === 'completed'
        ? 'completed'
        : independentPeerReviewStatus(
            governanceExternal.length > 0 || independentDocs.length > 0,
          );
    const independentCopy = independentPeerReviewCopy(independentStatus);
    const independentReviewers: PathwayReviewer[] =
      governanceExternal.length > 0
        ? governanceExternal
        : independentDocs.slice(0, 5).map((doc) =>
            this.toReviewer((doc.authority || 'Independent reviewer').trim(), {
              role: 'Independent External Reviewer',
              reviewerType: 'independent_external_peer_review',
              reviewedAt: doc.processedAt?.toISOString() ?? doc.uploadedAt.toISOString(),
            }),
          );

    const libraryRefs = pathway.libraryReferences ?? [];
    const sectionState = parsePresentationReviewState(pathway.presentationReview);
    const questions = pathway.questions ?? [];
    const supportsByRef = new Map<string, string[]>();
    for (const mapping of pathway.evidenceMappings) {
      if (mapping.suggested) continue;
      const list = supportsByRef.get(mapping.referenceId) ?? [];
      if (!list.includes(mapping.section)) list.push(mapping.section);
      supportsByRef.set(mapping.referenceId, list);
    }

    const references: PathwayReferenceDto[] = libraryRefs.length
      ? libraryRefs.map((ref) => {
          const fromMappings = supportsByRef.get(ref.id) ?? [];
          const fromQuestions = questions
            .filter((q) => q.evidenceRefIds.includes(ref.id))
            .map((q) => q.id);
          const sectionWide = sectionState.sectionEvidenceRefIds.includes(ref.id)
            ? ['presentation_review', 'section']
            : [];
          const supports = [...new Set([...fromMappings, ...fromQuestions, ...sectionWide])];
          return {
            id: ref.id,
            citationTitle: ref.citationTitle,
            organization: ref.organization,
            publicationYear: ref.publicationYear,
            edition: ref.edition,
            url: ref.url,
            referenceType: ref.documentType || ref.referenceType || 'source',
            supportsSections: supports.length ? supports : ['pathway'],
          };
        })
      : pathway.documents.map((doc) => ({
          id: doc.id,
          citationTitle: doc.fileName.replace(/\.[a-z0-9]+$/i, '') || doc.fileName,
          organization: doc.authority,
          publicationYear: doc.publicationYear,
          edition: null,
          url: doc.fileUrl?.startsWith('http') ? doc.fileUrl : null,
          referenceType: this.referenceType(doc.documentType),
          supportsSections: doc.purpose?.length ? doc.purpose : ['pathway'],
        }));

    const documentationRef = (id: string | null | undefined) => {
      if (!id) return null;
      const ref = libraryRefs.find((row) => row.id === id);
      if (!ref) return null;
      return {
        id: ref.id,
        citationTitle: ref.citationTitle,
        publicationYear: ref.publicationYear,
        edition: ref.edition,
      };
    };

    const versionHistory =
      pathway.versions.length > 0
        ? pathway.versions.map((version) => ({
            version: `v${version.version}`,
            effectiveDate: version.publishedAt.toISOString(),
            changeSummary: version.notes
              ? version.notes
                  .split('\n')
                  .map((line) => line.replace(/^•\s*/, '').trim())
                  .filter(Boolean)
              : ['Published pathway version'],
          }))
        : [
            {
              version: `v${pathway.version}`,
              effectiveDate: (pathway.publishedAt ?? pathway.updatedAt).toISOString(),
              changeSummary: ['Current published pathway'],
            },
          ];

    return {
      pathwayId: pathway.id,
      displayName: pathwayDisplayLabel(pathway),
      jurisdiction,
      pathwayVersion: `v${pathway.version}`,
      effectiveDate: (pathway.publishedAt ?? pathway.updatedAt).toISOString(),
      clinicalSources: sources,
      clinicalReview: {
        status: clinicalReviewCompleted ? 'completed' : 'pending',
        summary: clinicalReviewCompleted
          ? 'Reviewed by SafeScribe Clinical Review Committee'
          : 'Clinical review is pending',
        lastReviewed: governance.lastReviewedAt ?? lastReviewed?.toISOString() ?? null,
        reviewers: internalReviewers,
      },
      independentPeerReview: {
        status: independentStatus,
        summary: independentCopy.summary,
        reviewers: independentReviewers,
      },
      references,
      primaryReference: documentationRef(pathway.primaryDocumentationReferenceId),
      secondaryReference: documentationRef(pathway.secondaryDocumentationReferenceId),
      versionHistory,
    };
  }

  private toReviewer(
    rawName: string,
    meta: Omit<PathwayReviewer, 'fullName' | 'credentials'>,
  ): PathwayReviewer {
    const match = rawName.match(/^(.*?),\s*([^,]+)$/);
    if (match) {
      return { ...meta, fullName: match[1]!.trim(), credentials: match[2]!.trim() };
    }
    return { ...meta, fullName: rawName, credentials: null };
  }

  private sourcesFromDocuments(
    documents: Array<{
      documentFamily?: string | null;
      authority?: string | null;
      documentType?: string | null;
    }>,
  ): string[] {
    const labels = documents
      .map((doc) => doc.documentFamily || doc.authority || this.sourceFamily(doc.documentType))
      .filter((value): value is string => Boolean(value?.trim()));
    return [...new Set(labels)].slice(0, 6);
  }

  private sourceFamily(type?: string | null): string | null {
    if (!type) return null;
    if (type.includes('PROVINCIAL')) return 'Provincial guidance';
    if (type.includes('NATIONAL') || type.includes('GUIDELINE')) return 'Clinical guideline';
    if (type.includes('MONOGRAPH')) return 'Product monograph';
    return null;
  }

  private referenceType(type?: string | null): string {
    if (!type) return 'other';
    if (type.includes('MONOGRAPH')) return 'monograph';
    if (type.includes('GUIDELINE')) return 'guideline';
    if (type.includes('REVIEW')) return 'systematic_review';
    if (type.includes('POLICY')) return 'regulatory';
    return 'clinical_reference';
  }

  private async resolveProvince(
    consultation: { demographics?: unknown; documentation?: unknown; tenantId?: string | null },
    user: RequestUser,
  ): Promise<string | null> {
    const demo = (consultation.demographics ?? {}) as Record<string, unknown>;
    const fromDemo = normalizeProvinceCode(
      String(demo.province ?? demo.jurisdiction ?? '').trim(),
    );
    if (fromDemo) return fromDemo;

    const docs = (consultation.documentation ?? {}) as Record<string, unknown>;
    const patientInfo = (docs.patientInfo ?? docs.patient ?? {}) as Record<string, unknown>;
    const address = (patientInfo.addressLines ?? patientInfo.address ?? {}) as Record<
      string,
      unknown
    >;
    const fromAddr = normalizeProvinceCode(String(address.province ?? '').trim());
    if (fromAddr) return fromAddr;

    const tenantId = consultation.tenantId ?? user.tenantId;
    if (!tenantId) return null;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    return provinceFromTimezone(tenant?.timezone) ?? null;
  }

  private async findOrThrow(id: string) {
    const consultation = await this.prisma.consultation.findUnique({ where: { id } });
    if (!consultation) throw new NotFoundException('Consultation not found');
    return consultation;
  }

  private checkAccess(
    consultation: { tenantId: string | null; pharmacistId: string },
    user: RequestUser,
  ) {
    if (user.role === 'SUPER_ADMIN') return;
    if (user.role === 'PHARMACIST_ADMIN' && user.tenantId && consultation.tenantId === user.tenantId) {
      return;
    }
    if (consultation.pharmacistId === user.id) return;
    throw new ForbiddenException('You do not have access to this consultation');
  }

  private async auditSafe(
    user: RequestUser,
    req: Request | undefined,
    action: string,
    consultationId: string,
    metadata: Record<string, unknown>,
  ) {
    try {
      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId,
        action,
        module: 'consultations',
        ipAddress: req?.ip,
        userAgent: req?.headers?.['user-agent'],
        metadata: { consultationId, ...metadata },
      });
    } catch (err) {
      this.logger.warn(`Audit ${action} failed`, err);
    }
  }
}
