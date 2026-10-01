import { Injectable, Logger } from '@nestjs/common';
import {
  selectAdaptReferences,
  type AdaptEvidenceGapEvent,
  type AdaptReferenceSelectorInput,
  type AdaptReferenceSelectorResult,
  type CandidateReference,
  type ClinicalUseTagCode,
} from '@safescript/shared';
import { AuditService } from '@/modules/audit/audit.service';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class AdaptReferenceSelectorService {
  private readonly logger = new Logger(AdaptReferenceSelectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Selects the most relevant approved SafeScribe references for an Adapt consultation.
   */
  async selectReferences(
    consultationId: string,
    input: AdaptReferenceSelectorInput,
  ): Promise<AdaptReferenceSelectorResult> {
    const startTime = Date.now();
    let candidates: CandidateReference[] = [];

    // Query Central Evidence Library pathway references if pathway is identified
    if (input.pathwayId) {
      try {
        const dbReferences = await this.prisma.pathwayEvidenceReference.findMany({
          where: {
            pathwayId: input.pathwayId,
            status: { in: ['verified', 'approved', 'published', 'active'] },
          },
          include: {
            mappings: true,
            libraryItem: true,
          },
        });

        candidates = dbReferences.map((ref) => {
          // Extract clinical use tags from mappings or defaults
          const tags: ClinicalUseTagCode[] = [];
          for (const m of ref.mappings) {
            if (m.section === 'treatment_options') {
              tags.push('dose', 'treatment_place_in_therapy');
            } else if (m.section === 'patient_guidance') {
              tags.push('counselling_patient_guidance', 'adherence_use');
            } else if (m.section === 'red_flags') {
              tags.push('contraindications_precautions', 'red_flags_referral');
            } else if (m.section === 'presentation_review') {
              tags.push('assessment');
            }
          }

          // If document type is guideline or monograph, ensure core tags
          if (ref.documentType?.includes('monograph')) {
            tags.push('dose', 'contraindications_precautions');
          }

          return {
            id: ref.id,
            title: ref.citationTitle,
            organizationPublisher: ref.organization ?? ref.libraryItem?.organization,
            documentType: ref.documentType ?? ref.libraryItem?.documentType,
            jurisdiction: ref.jurisdiction ?? ref.libraryItem?.jurisdiction,
            yearEdition: ref.edition ?? (ref.publicationYear ? String(ref.publicationYear) : undefined),
            url: ref.url ?? ref.libraryItem?.url,
            doi: ref.doi ?? ref.libraryItem?.doi,
            status: ref.status,
            verificationRequired: false,
            tags,
            pathwayId: ref.pathwayId,
            relevantSections: ref.mappings.map((m) => m.section),
            source: 'pathway_library' as const,
          };
        });
      } catch (err) {
        this.logger.warn(
          `Failed to load pathway references for pathway ${input.pathwayId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const result = selectAdaptReferences(input, candidates);
    const durationMs = Date.now() - startTime;

    this.logger.log(
      `AdaptReferenceSelector: consultation=${consultationId} pathway=${input.pathwayId ?? 'none'} type=${input.adaptationType} reason=${input.adaptationReasonCode} selected=${result.allSelectedReferences.length} duration=${durationMs}ms`,
    );

    // Section 27: Evidence Gap Logging
    if (result.coverage.missingTags.length > 0) {
      const gapEvent: AdaptEvidenceGapEvent = {
        pathwayId: input.pathwayId ?? undefined,
        conditionCode: input.conditionCode ?? undefined,
        adaptationType: input.adaptationType,
        adaptationReasonCode: input.adaptationReasonCode,
        requestedTags: result.requestedTags,
        missingTags: result.coverage.missingTags,
        consultationId,
        createdAt: new Date().toISOString(),
      };
      this.logger.debug(`Evidence gap detected: ${JSON.stringify(gapEvent)}`);
    }

    return result;
  }
}
