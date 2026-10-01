/**
 * Adapt Step 4 — DAP + PCP + Patient Handout documentation refinement.
 *
 * Builds deterministic documents from the frozen Adapt snapshot, then optionally
 * refines narrative with Adapt Document Session system prompts.
 * AI failure never blocks the encounter (Nest drafts remain the fallback).
 * Adapted Prescription remains deterministic (Prescribe template).
 * Prescribe / Renew document generation paths are untouched.
 */

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AiConfigService } from '@/modules/ai-config/ai-config.service';
import { AI_PROMPT_KEYS, getDefaultPrompt } from '@/modules/ai-config/ai-config.defaults';
import { AiEngineClient } from '@/modules/clinical-pathways/ai-engine.client';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import {
  ADAPT_DOCUMENTATION_PROMPT_KEYS,
  ADAPT_PCP_UI_TITLE,
  ADAPT_PATIENT_HANDOUT_UI_TITLE,
  adaptPromptCanDriveDapGeneration,
  adaptPromptCanDrivePatientHandoutGeneration,
  adaptPromptCanDrivePcpGeneration,
  assembleAdaptDapDraftFromAi,
  assembleAdaptPatientHandoutDraftFromAi,
  assembleAdaptPcpDraftFromAi,
  buildAdaptConsultationNote,
  buildAdaptDapPromptPayload,
  buildAdaptPatientHandout,
  buildAdaptPatientHandoutPromptPayload,
  buildAdaptPrescriberCommunication,
  buildAdaptPcpPromptPayload,
  parseAdaptPayload,
  SAFESCRIBE_MODULES,
  type AdaptDocumentContent,
  type AdaptPatientDocumentInfo,
  type AdaptStepFour,
} from '@safescript/shared';

function hashPromptContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

export type AdaptRefineDocumentKind =
  | 'consultation_note'
  | 'prescriber_communication'
  | 'patient_care_summary';

@Injectable()
export class AdaptDocumentationService {
  private readonly logger = new Logger(AdaptDocumentationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly aiConfig: AiConfigService,
    private readonly aiEngine: AiEngineClient,
  ) {}

  /**
   * Refine Adapt DAP consultation note (and optionally PCP) with live prompts.
   * Kept for backward compatibility with the refine-dap endpoint.
   */
  async refineDapNote(
    consultationId: string,
    user: RequestUser,
  ): Promise<{
    consultation_note: AdaptDocumentContent;
    usedAiDraft: boolean;
    promptVersion: string;
    warnings: string[];
  }> {
    const result = await this.refineClinicalDocuments(consultationId, user, [
      'consultation_note',
    ]);
    return {
      consultation_note: result.consultation_note!,
      usedAiDraft: result.usedAiDraft.consultation_note,
      promptVersion: result.promptVersion,
      warnings: result.warnings,
    };
  }

  /**
   * Refine Adapt clinical Step 4 docs (DAP, PCP, and/or Patient Handout)
   * from the frozen snapshot. One Assist Engine call when multiple are requested.
   */
  async refineClinicalDocuments(
    consultationId: string,
    user: RequestUser,
    kinds: AdaptRefineDocumentKind[] = [
      'consultation_note',
      'prescriber_communication',
      'patient_care_summary',
    ],
  ): Promise<{
    consultation_note?: AdaptDocumentContent;
    prescriber_communication?: AdaptDocumentContent;
    patient_care_summary?: AdaptDocumentContent;
    usedAiDraft: {
      consultation_note: boolean;
      prescriber_communication: boolean;
      patient_care_summary: boolean;
    };
    promptVersion: string;
    warnings: string[];
  }> {
    const wantDap = kinds.includes('consultation_note');
    const wantPcp = kinds.includes('prescriber_communication');
    const wantHandout = kinds.includes('patient_care_summary');
    if (!wantDap && !wantPcp && !wantHandout) {
      throw new BadRequestException('Select at least one Adapt document to refine.');
    }

    const consultation = await this.requireAdaptConsultation(consultationId, user);
    const payload = parseAdaptPayload(consultation.renewPayload);
    if (!payload.step1) {
      throw new BadRequestException(
        'Adapt Step 1 must be completed before generating Adapt documents.',
      );
    }
    if (!payload.step3B?.confirmed) {
      throw new BadRequestException(
        'Confirm Adaptation & Continue to Documents before generating Adapt documents.',
      );
    }

    const promptKeys = [
      ...(wantDap ? [AI_PROMPT_KEYS.ADAPT_DOCUMENTATION_CONSULTATION_NOTE] : []),
      ...(wantPcp ? [AI_PROMPT_KEYS.ADAPT_DOCUMENTATION_PRESCRIBER_COMMUNICATION] : []),
      ...(wantHandout ? [AI_PROMPT_KEYS.ADAPT_DOCUMENTATION_PATIENT_CARE_SUMMARY] : []),
    ];

    const [pharmacist, tenant, livePrompts] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: consultation.pharmacistId },
        select: { firstName: true, lastName: true },
      }),
      consultation.tenantId
        ? this.prisma.tenant.findUnique({
            where: { id: consultation.tenantId },
            select: { name: true, address: true, phone: true, faxNumber: true },
          })
        : Promise.resolve(null),
      this.aiConfig.getLivePrompts(promptKeys),
    ]);

    const pharmacistName = [pharmacist?.firstName, pharmacist?.lastName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' ');

    const dapPrompt =
      livePrompts[AI_PROMPT_KEYS.ADAPT_DOCUMENTATION_CONSULTATION_NOTE] ??
      getDefaultPrompt(AI_PROMPT_KEYS.ADAPT_DOCUMENTATION_CONSULTATION_NOTE)?.content ??
      '';
    const pcpPrompt =
      livePrompts[AI_PROMPT_KEYS.ADAPT_DOCUMENTATION_PRESCRIBER_COMMUNICATION] ??
      getDefaultPrompt(AI_PROMPT_KEYS.ADAPT_DOCUMENTATION_PRESCRIBER_COMMUNICATION)
        ?.content ??
      '';
    const handoutPrompt =
      livePrompts[AI_PROMPT_KEYS.ADAPT_DOCUMENTATION_PATIENT_CARE_SUMMARY] ??
      getDefaultPrompt(AI_PROMPT_KEYS.ADAPT_DOCUMENTATION_PATIENT_CARE_SUMMARY)?.content ??
      '';

    const patientInfo = this.resolvePatientInfo(consultation, payload.step4);
    const pharmacistInfo = {
      name: pharmacistName || 'Pharmacist',
      licenseNumber: '—',
      pharmacyName: tenant?.name?.trim() || 'SafeScribe Clinical Pharmacy',
      pharmacyAddress: tenant?.address?.trim() || '—',
      pharmacyPhone: tenant?.phone?.trim() || '—',
      pharmacyFax: tenant?.faxNumber?.trim() || '—',
    };

    const sharedContext = {
      pharmacistName: pharmacistInfo.name,
      pharmacistLicense: pharmacistInfo.licenseNumber,
      pharmacyName: pharmacistInfo.pharmacyName,
      pharmacyAddress: pharmacistInfo.pharmacyAddress,
      pharmacyPhone: pharmacistInfo.pharmacyPhone,
      pharmacyFax: pharmacistInfo.pharmacyFax,
      confirmedBy: pharmacistInfo.name,
      confirmedAt: payload.step3B.confirmedAt,
    };

    const dapBuildInput = {
      step1: payload.step1,
      step2A: payload.step2A,
      step2B: payload.step2B,
      step3A: payload.step3A,
      step3B: payload.step3B,
      patientInfo,
      consultationId,
      context: {
        ...sharedContext,
        systemPrompt: dapPrompt || null,
        promptHash: dapPrompt ? hashPromptContent(dapPrompt) : null,
      },
      pharmacistReferencesConsulted: payload.step3B.pharmacistReferencesConsulted,
      safeScribeSupportingReferences: payload.step3B.safeScribeSupportingReferences,
    };

    const pcpBuildInput = {
      ...dapBuildInput,
      context: {
        ...sharedContext,
        systemPrompt: pcpPrompt || null,
        promptHash: pcpPrompt ? hashPromptContent(pcpPrompt) : null,
      },
    };

    const handoutBuildInput = {
      step1: payload.step1,
      step2A: payload.step2A,
      step2B: payload.step2B,
      step3A: payload.step3A,
      step3B: payload.step3B,
      patientInfo,
      context: {
        ...sharedContext,
        systemPrompt: handoutPrompt || null,
        promptHash: handoutPrompt ? hashPromptContent(handoutPrompt) : null,
      },
    };

    const dapFallback = wantDap ? buildAdaptConsultationNote(dapBuildInput) : null;
    const pcpFallback = wantPcp ? buildAdaptPrescriberCommunication(pcpBuildInput) : null;
    const handoutFallback = wantHandout ? buildAdaptPatientHandout(handoutBuildInput) : null;

    let consultationNote = dapFallback
      ? this.toDapDocumentContent(dapFallback)
      : undefined;
    let prescriberCommunication = pcpFallback
      ? this.toPcpDocumentContent(pcpFallback)
      : undefined;
    let patientCareSummary = handoutFallback
      ? this.toHandoutDocumentContent(handoutFallback)
      : undefined;

    let usedAiDap = false;
    let usedAiPcp = false;
    let usedAiHandout = false;
    const warnings: string[] = [
      ...(dapFallback?.warnings ?? []),
      ...(pcpFallback?.warnings ?? []),
      ...(handoutFallback?.warnings ?? []),
    ];

    const canDriveDap =
      wantDap && Boolean(dapPrompt.trim()) && adaptPromptCanDriveDapGeneration(dapPrompt);
    const canDrivePcp =
      wantPcp && Boolean(pcpPrompt.trim()) && adaptPromptCanDrivePcpGeneration(pcpPrompt);
    const canDriveHandout =
      wantHandout &&
      Boolean(handoutPrompt.trim()) &&
      adaptPromptCanDrivePatientHandoutGeneration(handoutPrompt);

    const requested: string[] = [];
    if (canDriveDap) requested.push('consultation_note');
    if (canDrivePcp) requested.push('prescriber_communication');
    if (canDriveHandout) requested.push('patient_care_summary');

    if (this.aiEngine.isAvailable && requested.length > 0) {
      try {
        const dapSource = dapFallback
          ? buildAdaptDapPromptPayload(dapFallback.payload)
          : undefined;
        const pcpSource = pcpFallback
          ? buildAdaptPcpPromptPayload(pcpFallback.payload)
          : undefined;
        const handoutSource = handoutFallback
          ? buildAdaptPatientHandoutPromptPayload(handoutFallback.source)
          : undefined;

        const result = await this.aiEngine.postJson<{
          documents?: {
            consultation_note?: unknown;
            prescriber_communication?: unknown;
            patient_care_summary?: unknown;
          };
        }>(
          '/api/v1/consultations/generate-documentation',
          {
            consultation_data: {
              ...(dapSource
                ? {
                    adapt_dap_source: dapSource,
                    dap_payload: dapSource,
                  }
                : {}),
              ...(pcpSource
                ? {
                    adapt_pcp_source: pcpSource,
                    pcp_payload: pcpSource,
                  }
                : {}),
              ...(handoutSource
                ? {
                    adapt_handout_source: handoutSource,
                    patient_summary_payload: handoutSource,
                  }
                : {}),
            },
            document_prompts: {
              ...(canDriveDap ? { consultation_note: dapPrompt } : {}),
              ...(canDrivePcp ? { prescriber_communication: pcpPrompt } : {}),
              ...(canDriveHandout ? { patient_care_summary: handoutPrompt } : {}),
            },
            stricter_retry: false,
            requested_documents: requested,
          },
          90_000,
        );

        if (wantDap && canDriveDap) {
          const assembled = assembleAdaptDapDraftFromAi(
            result?.documents?.consultation_note,
          );
          if (assembled.ok) {
            const refined = buildAdaptConsultationNote({
              ...dapBuildInput,
              aiDraft: assembled.draft,
            });
            if (refined.usedAiDraft) {
              usedAiDap = true;
              consultationNote = this.toDapDocumentContent(refined);
            } else {
              this.logger.warn(
                `adapt.dap.note_rejected consultationId=${consultationId} — keeping Nest draft`,
              );
              warnings.push('AI DAP draft rejected; deterministic fallback used');
            }
          } else {
            this.logger.warn(
              `adapt.dap.note_incomplete consultationId=${consultationId} — keeping Nest draft`,
            );
          }
        }

        if (wantPcp && canDrivePcp && pcpFallback) {
          const assembled = assembleAdaptPcpDraftFromAi(
            result?.documents?.prescriber_communication,
          );
          if (assembled.ok) {
            const refined = buildAdaptPrescriberCommunication({
              ...pcpBuildInput,
              aiDraft: assembled.draft,
            });
            if (refined.usedAiDraft) {
              usedAiPcp = true;
              prescriberCommunication = this.toPcpDocumentContent(refined);
            } else {
              this.logger.warn(
                `adapt.pcp.note_rejected consultationId=${consultationId} — keeping Nest draft`,
              );
              warnings.push('AI PCP draft rejected; deterministic fallback used');
            }
          } else {
            this.logger.warn(
              `adapt.pcp.note_incomplete consultationId=${consultationId} — keeping Nest draft`,
            );
          }
        }

        if (wantHandout && canDriveHandout && handoutFallback) {
          const assembled = assembleAdaptPatientHandoutDraftFromAi(
            result?.documents?.patient_care_summary,
          );
          if (assembled.ok) {
            const refined = buildAdaptPatientHandout({
              ...handoutBuildInput,
              aiDraft: assembled.draft,
            });
            if (refined.usedAiDraft) {
              usedAiHandout = true;
              patientCareSummary = this.toHandoutDocumentContent(refined);
            } else {
              this.logger.warn(
                `adapt.handout.note_rejected consultationId=${consultationId} — keeping Nest draft`,
              );
              warnings.push('AI handout draft rejected; deterministic fallback used');
            }
          } else {
            this.logger.warn(
              `adapt.handout.note_incomplete consultationId=${consultationId} — keeping Nest draft`,
            );
          }
        }
      } catch (err) {
        this.logger.warn(
          `adapt.docs.generate_failed consultationId=${consultationId} — keeping Nest drafts: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    } else if (requested.length === 0 && (wantDap || wantPcp || wantHandout)) {
      this.logger.warn(
        `adapt.docs.prompt_unusable consultationId=${consultationId} — Nest drafts only`,
      );
    }

    await this.persistRefinedDocuments(consultationId, payload, {
      consultation_note: consultationNote,
      prescriber_communication: prescriberCommunication,
      patient_care_summary: patientCareSummary,
    });

    const snapshotId =
      dapFallback?.snapshot.snapshotId ??
      pcpFallback?.payload.provenance.snapshotId ??
      null;

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'UPDATE',
      module: 'CONSULTATIONS',
      newValue: {
        consultationId,
        documents: kinds,
        usedAiDraft: {
          consultation_note: usedAiDap,
          prescriber_communication: usedAiPcp,
          patient_care_summary: usedAiHandout,
        },
        promptKeys: [
          ...(wantDap ? [ADAPT_DOCUMENTATION_PROMPT_KEYS.CONSULTATION_NOTE] : []),
          ...(wantPcp ? [ADAPT_DOCUMENTATION_PROMPT_KEYS.PRESCRIBER_COMMUNICATION] : []),
          ...(wantHandout ? [ADAPT_DOCUMENTATION_PROMPT_KEYS.PATIENT_CARE_SUMMARY] : []),
        ],
        snapshotId,
      },
    });

    return {
      consultation_note: consultationNote,
      prescriber_communication: prescriberCommunication,
      patient_care_summary: patientCareSummary,
      usedAiDraft: {
        consultation_note: usedAiDap,
        prescriber_communication: usedAiPcp,
        patient_care_summary: usedAiHandout,
      },
      promptVersion:
        dapFallback?.snapshot.promptVersion ??
        pcpFallback?.payload.provenance.promptVersion ??
        handoutFallback?.source.promptVersion ??
        '',
      warnings,
    };
  }

  private toDapDocumentContent(built: {
    html: string;
    plainText: string;
  }): AdaptDocumentContent {
    return {
      id: 'consultation_note',
      title: 'Pharmacist Consultation Note (DAP)',
      shortName: 'Consultation Note',
      fileName: '01_Pharmacist_Adaptation_Consultation_Note.pdf',
      category: 'clinical',
      categoryLabel: 'Clinical Record',
      description:
        'Regulatory DAP clinical encounter note for prescription adaptation. Retain for pharmacy audit and clinical records.',
      bullets: ['Assessment', 'Plan', 'Safety Evaluation', 'Follow-up'],
      html: built.html,
      plainText: built.plainText,
      lastEditedAt: new Date().toISOString(),
    };
  }

  private toPcpDocumentContent(built: {
    html: string;
    plainText: string;
  }): AdaptDocumentContent {
    return {
      id: 'prescriber_communication',
      title: ADAPT_PCP_UI_TITLE,
      shortName: 'Prescriber Notification',
      fileName: '02_Prescriber_Adaptation_Notification.pdf',
      category: 'communication',
      categoryLabel: 'Clinical Record',
      description:
        'Continuity-of-care notification to the original prescriber detailing the adaptation rationale and monitoring plan.',
      bullets: [
        'Original vs Adapted Rx',
        'Clinical Rationale',
        'eGFR / Lab Findings',
        'Monitoring Plan',
      ],
      html: built.html,
      plainText: built.plainText,
      lastEditedAt: new Date().toISOString(),
    };
  }

  private toHandoutDocumentContent(built: {
    html: string;
    plainText: string;
  }): AdaptDocumentContent {
    return {
      id: 'patient_care_summary',
      title: ADAPT_PATIENT_HANDOUT_UI_TITLE,
      shortName: 'Patient Handout',
      fileName: '03_Patient_Adaptation_Care_Summary.pdf',
      category: 'patient',
      categoryLabel: 'Patient Documents',
      description:
        'Simple medication-change and follow-up summary for the patient. Medication directions are taken from the confirmed adapted prescription.',
      bullets: ['Updated medication', 'What changed', 'How to use it', 'Follow-up'],
      html: built.html,
      plainText: built.plainText,
      lastEditedAt: new Date().toISOString(),
    };
  }

  private resolvePatientInfo(
    consultation: { demographics?: unknown; documentation?: unknown },
    step4?: AdaptStepFour,
  ): Partial<AdaptPatientDocumentInfo> {
    if (step4?.patientInfo) return step4.patientInfo;
    const docs =
      consultation.documentation && typeof consultation.documentation === 'object'
        ? (consultation.documentation as Record<string, unknown>)
        : {};
    const fromDocs =
      docs.patientInfo && typeof docs.patientInfo === 'object'
        ? (docs.patientInfo as Partial<AdaptPatientDocumentInfo>)
        : {};
    const dem =
      consultation.demographics && typeof consultation.demographics === 'object'
        ? (consultation.demographics as Record<string, unknown>)
        : {};
    return {
      name:
        fromDocs.name ||
        [dem.firstName, dem.lastName].filter(Boolean).join(' ').trim() ||
        undefined,
      dateOfBirth:
        fromDocs.dateOfBirth ||
        (typeof dem.dateOfBirth === 'string' ? dem.dateOfBirth : undefined),
      patientId:
        fromDocs.patientId || (typeof dem.phn === 'string' ? dem.phn : undefined),
      phone: fromDocs.phone || (typeof dem.phone === 'string' ? dem.phone : undefined),
      address: fromDocs.address,
      skipped: fromDocs.skipped,
      confirmed: fromDocs.confirmed,
    };
  }

  private async persistRefinedDocuments(
    consultationId: string,
    payload: ReturnType<typeof parseAdaptPayload>,
    docs: {
      consultation_note?: AdaptDocumentContent;
      prescriber_communication?: AdaptDocumentContent;
      patient_care_summary?: AdaptDocumentContent;
    },
  ) {
    const step4 = payload.step4;
    if (!step4?.documents) return;
    if (
      !docs.consultation_note &&
      !docs.prescriber_communication &&
      !docs.patient_care_summary
    ) {
      return;
    }

    const nextStep4: AdaptStepFour = {
      ...step4,
      documents: {
        ...step4.documents,
        ...(docs.consultation_note
          ? { consultation_note: docs.consultation_note }
          : {}),
        ...(docs.prescriber_communication
          ? { prescriber_communication: docs.prescriber_communication }
          : {}),
        ...(docs.patient_care_summary
          ? { patient_care_summary: docs.patient_care_summary }
          : {}),
      },
      lastGeneratedAt: new Date().toISOString(),
      revision: (step4.revision ?? 0) + 1,
    };

    const nextPayload = {
      ...payload,
      step4: nextStep4,
      updatedAt: new Date().toISOString(),
    };

    await this.prisma.consultation.update({
      where: { id: consultationId },
      data: {
        renewPayload: JSON.parse(JSON.stringify(nextPayload)),
        documentation: JSON.parse(JSON.stringify(nextStep4)),
      },
    });
  }

  private async requireAdaptConsultation(consultationId: string, user: RequestUser) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
    });
    if (!consultation) throw new NotFoundException('Consultation not found');
    if (consultation.module !== SAFESCRIBE_MODULES.ADAPT) {
      throw new BadRequestException('This endpoint is only available for Adapt consultations.');
    }
    if (user.role === 'SUPER_ADMIN') return consultation;
    if (
      user.role === 'PHARMACIST_ADMIN' &&
      user.tenantId &&
      consultation.tenantId === user.tenantId
    ) {
      return consultation;
    }
    if (consultation.pharmacistId === user.id) return consultation;
    throw new ForbiddenException('You do not have access to this consultation');
  }
}
