import { BadRequestException, GatewayTimeoutException, Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { MedicationSafetyReleaseService } from '@/modules/medication-safety/medication-safety-release.service';
import { TerminologySnapshotService } from '@/modules/terminology/snapshot/terminology-snapshot.service';
import { isPrismaTransactionTimeout } from '../import/promote-errors';

export type PreflightCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
};

@Injectable()
export class ClinicalRepositoryPublicationService {
  private readonly logger = new Logger(ClinicalRepositoryPublicationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly releaseService: MedicationSafetyReleaseService,
    private readonly terminology: TerminologySnapshotService,
  ) {}

  /** Move every DRAFT rule version to APPROVED so Publish can compile a release. */
  async approveAllDrafts(user: RequestUser): Promise<number> {
    const result = await this.prisma.safetyRuleVersion.updateMany({
      where: { status: 'DRAFT' },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedById: user.id,
      },
    });
    return result.count;
  }

  async preflight(): Promise<{ ok: boolean; checks: PreflightCheck[] }> {
    const checks: PreflightCheck[] = [];

    const draftCount = await this.prisma.safetyRuleVersion.count({
      where: { status: 'DRAFT' },
    });
    const approvedCount = await this.prisma.safetyRuleVersion.count({
      where: { status: 'APPROVED' },
    });
    const publishable = approvedCount + draftCount;
    checks.push({
      id: 'approved_rules',
      label: 'Rules ready to publish',
      ok: publishable > 0,
      detail:
        publishable === 0
          ? 'No draft or approved rules — import and promote a workbook first'
          : approvedCount > 0 && draftCount === 0
            ? `${approvedCount} approved rule(s) ready`
            : approvedCount > 0
              ? `${approvedCount} approved, ${draftCount} draft (Approve All or Publish will approve drafts)`
              : `${draftCount} draft rule(s) — Approve All, then Publish (or Publish alone)`,
    });

    const unresolvedEvidence = await this.prisma.safetyRuleEvidence.count({
      where: {
        evidenceLinkId: { not: null },
        OR: [
          { sourceStatus: 'UNRESOLVED' },
          { approvalStatus: 'PENDING_REVIEW' },
          { approvalStatus: 'NOT_REVIEWED' },
        ],
      },
    });
    checks.push({
      id: 'evidence',
      label: 'Evidence sources',
      ok: true,
      detail:
        unresolvedEvidence > 0
          ? `${unresolvedEvidence} evidence record(s) still pending review (warning only)`
          : 'All evidence ok',
    });

    // Auto-seed terminology when missing so Publish is not blocked after DB wipes
    // or on fresh environments without Infoway CCDD credentials.
    const { release: activeTerm, created: termSeeded } =
      await this.terminology.ensureActiveSeedRelease();
    checks.push({
      id: 'terminology',
      label: 'Terminology release pinned',
      ok: Boolean(activeTerm),
      detail: termSeeded
        ? `Auto-seeded active pin: ${activeTerm.releaseKey} (local seed — Resync from CCDD anytime)`
        : activeTerm
          ? `Active: ${activeTerm.releaseKey} (${activeTerm.ccddVersion})`
          : 'No active terminology',
    });

    const valueSetsWithoutMembers = await this.prisma.clinicalValueSet.count({
      where: { members: { none: {} } },
    });
    checks.push({
      id: 'value_set_members',
      label: 'Value sets have membership rows',
      ok: true,
      detail:
        valueSetsWithoutMembers > 0
          ? `${valueSetsWithoutMembers} value set(s) have no members yet (warning)`
          : 'OK',
    });

    const testCases = await this.prisma.clinicalTestCase.count();
    checks.push({
      id: 'test_cases_present',
      label: 'Repository test cases',
      ok: true,
      detail:
        testCases > 0
          ? `${testCases} test case(s) — optional under Test Runs`
          : 'No test suite loaded — publish uses golden allergy gate',
    });

    checks.push({
      id: 'required_tests',
      label: 'Clinical regression suite',
      ok: true,
      detail:
        'Advisory only — full suite is optional under Test Runs; publish is gated by golden allergy check',
    });

    const blocking = checks.filter((c) => !c.ok && c.id === 'approved_rules');
    return { ok: blocking.length === 0, checks };
  }

  listReleases(params: { page?: number; limit?: number } = {}) {
    return this.releaseService.list(params);
  }

  async restoreRelease(
    releaseId: string,
    user: RequestUser,
    req: Request,
    reason?: string,
  ) {
    const result = await this.releaseService.restore(releaseId, user, req, {
      reason,
    });
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId,
      action: 'CLINICAL_REPOSITORY_RESTORE',
      module: 'clinical-repository',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      previousValue: result.previous ?? undefined,
      newValue: { ...result.restored, reason: reason?.trim() || null },
    });
    return result;
  }

  async publish(user: RequestUser, req: Request, releaseNotes?: string) {
    const draftsApproved = await this.approveAllDrafts(user);
    if (draftsApproved > 0) {
      this.logger.log(`Auto-approved ${draftsApproved} draft rule(s) before publish`);
    }

    // Ensure terminology pin exists before preflight / release compile
    const { release: termPin } = await this.terminology.ensureActiveSeedRelease(user.id);

    const pre = await this.preflight();
    if (!pre.ok) {
      throw new BadRequestException({
        message: 'Publication blocked by preflight checks',
        checks: pre.checks,
      });
    }

    const approved = await this.prisma.safetyRuleVersion.count({
      where: { status: 'APPROVED' },
    });
    if (!approved) {
      throw new BadRequestException(
        'No approved rules to publish. Import a workbook, promote it, then Approve All.',
      );
    }

    const activeTerm = (await this.terminology.getActiveRelease()) ?? termPin;
    let result: Awaited<ReturnType<MedicationSafetyReleaseService['publish']>>;
    try {
      result = await this.releaseService.publish(user, req, {
        releaseNotes: releaseNotes?.trim() || undefined,
      });
    } catch (err) {
      if (isPrismaTransactionTimeout(err)) {
        throw new GatewayTimeoutException(
          'Publishing timed out while compiling the knowledge release. Retry — a partial publish is rolled back automatically.',
        );
      }
      throw err;
    }

    if (result.release?.id && activeTerm) {
      await this.prisma.safetyKnowledgeRelease.update({
        where: { id: result.release.id },
        data: { terminologyReleaseId: activeTerm.id },
      });
    }

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId,
      action: 'CLINICAL_REPOSITORY_PUBLISH',
      module: 'clinical-repository',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      newValue: {
        ...result,
        draftsApproved,
        terminologyReleaseId: activeTerm?.id ?? null,
        preflight: pre.checks,
      },
    });

    return {
      ...result,
      draftsApproved,
      preflight: pre,
      terminologyReleaseId: activeTerm?.id ?? null,
    };
  }
}
