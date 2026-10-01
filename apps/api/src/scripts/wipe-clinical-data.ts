/**
 * Wipe pathways, consultations, and Safety Engine / clinical repository data.
 * Preserves users, tenants, roles, auth, and platform settings.
 *
 * Usage (repo root, DATABASE_URL set):
 *   CONFIRM_WIPE=YES npx tsx --tsconfig apps/api/tsconfig.json \
 *     apps/api/src/scripts/wipe-clinical-data.ts
 *
 * Optional:
 *   WIPE_REDIS_URL=redis://...  — flush Safety Engine Redis keys after wipe
 */
import { PrismaClient } from '@prisma/client';

async function wipe() {
  if (process.env.CONFIRM_WIPE !== 'YES') {
    console.error('Refusing to run: set CONFIRM_WIPE=YES');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const counts: Record<string, number> = {};

  const tally = async (label: string, fn: () => Promise<{ count: number }>) => {
    const { count } = await fn();
    counts[label] = count;
    console.log(`  cleared ${label}: ${count}`);
  };

  try {
    console.log('=== Wipe clinical + safety data ===');
    console.log(`DATABASE_URL host: ${(process.env.DATABASE_URL ?? '').replace(/:[^:@/]+@/, ':***@').slice(0, 80)}…`);

    // ── Consultations (must clear before pathways due to FK) ───────────────
    console.log('\n[1/3] Consultations');
    await tally('faxLog', () => prisma.faxLog.deleteMany());
    await tally('consultationReferralOutcome', () =>
      prisma.consultationReferralOutcome.deleteMany(),
    );
    await tally('consultationAuditLog', () => prisma.consultationAuditLog.deleteMany());
    await tally('safetyEvaluationOverride', () => prisma.safetyEvaluationOverride.deleteMany());
    await tally('safetyEvaluationFinding', () => prisma.safetyEvaluationFinding.deleteMany());
    await tally('safetyEvaluation', () => prisma.safetyEvaluation.deleteMany());
    await tally('consultation', () => prisma.consultation.deleteMany());

    // ── Pathways (+ cascade children via deleteMany on parent where possible) ─
    console.log('\n[2/3] Clinical pathways');
    // Children may cascade from ClinicalPathway delete; clear known children first for safety.
    await tally('clinicalDocumentOverlap', () => prisma.clinicalDocumentOverlap.deleteMany());
    await tally('clinicalConceptSource', () => prisma.clinicalConceptSource.deleteMany());
    await tally('clinicalDocumentChunk', () => prisma.clinicalDocumentChunk.deleteMany());
    await tally('clinicalDocument', () => prisma.clinicalDocument.deleteMany());
    await tally('clinicalConcept', () => prisma.clinicalConcept.deleteMany());
    await tally('clinicalRule', () => prisma.clinicalRule.deleteMany());
    await tally('clinicalQuestion', () => prisma.clinicalQuestion.deleteMany());
    await tally('clinicalSection', () => prisma.clinicalSection.deleteMany());
    await tally('clinicalTreatment', () => prisma.clinicalTreatment.deleteMany());
    await tally('clinicalCounselling', () => prisma.clinicalCounselling.deleteMany());
    await tally('clinicalFollowup', () => prisma.clinicalFollowup.deleteMany());
    await tally('clinicalVersion', () => prisma.clinicalVersion.deleteMany());
    await tally('clinicalPublication', () => prisma.clinicalPublication.deleteMany());
    await tally('clinicalPathway', () => prisma.clinicalPathway.deleteMany());

    // ── Safety Engine / Clinical Repository ────────────────────────────────
    console.log('\n[3/3] Safety Engine + clinical repository');
    await tally('safetyReleaseItem', () => prisma.safetyReleaseItem.deleteMany());
    await tally('safetyReleasePointer', () => prisma.safetyReleasePointer.deleteMany());
    await tally('safetyKnowledgeRelease', () => prisma.safetyKnowledgeRelease.deleteMany());

    await tally('safetyLabRuleDetail', () => prisma.safetyLabRuleDetail.deleteMany());
    await tally('safetyDdiRuleDetail', () => prisma.safetyDdiRuleDetail.deleteMany());
    await tally('safetyDrugDiseaseRuleDetail', () =>
      prisma.safetyDrugDiseaseRuleDetail.deleteMany(),
    );
    await tally('safetyPregnancyRuleDetail', () => prisma.safetyPregnancyRuleDetail.deleteMany());
    await tally('safetyLactationRuleDetail', () => prisma.safetyLactationRuleDetail.deleteMany());
    await tally('safetyRenalRuleDetail', () => prisma.safetyRenalRuleDetail.deleteMany());
    await tally('safetyRuleParticipant', () => prisma.safetyRuleParticipant.deleteMany());
    await tally('safetyRuleEvidence', () => prisma.safetyRuleEvidence.deleteMany());
    await tally('safetyRuleVersion', () => prisma.safetyRuleVersion.deleteMany());
    await tally('safetyKnowledgeRule', () => prisma.safetyKnowledgeRule.deleteMany());

    await tally('clinicalImportRow', () => prisma.clinicalImportRow.deleteMany());
    await tally('clinicalImportBatch', () => prisma.clinicalImportBatch.deleteMany());
    await tally('clinicalTestCase', () => prisma.clinicalTestCase.deleteMany());
    await tally('clinicalTestInput', () => prisma.clinicalTestInput.deleteMany());
    await tally('clinicalValueSetMember', () => prisma.clinicalValueSetMember.deleteMany());
    await tally('clinicalValueSet', () => prisma.clinicalValueSet.deleteMany());

    await tally('terminologyIngredientEdge', () =>
      prisma.terminologyIngredientEdge.deleteMany(),
    );
    await tally('terminologyDrugConcept', () => prisma.terminologyDrugConcept.deleteMany());
    await tally('terminologyRelease', () => prisma.terminologyRelease.deleteMany());

    await tally('medicationIngredient', () => prisma.medicationIngredient.deleteMany());
    await tally('drugClassMembership', () => prisma.drugClassMembership.deleteMany());
    await tally('drugCatalog', () => prisma.drugCatalog.deleteMany());
    await tally('drugClassTaxonomy', () => prisma.drugClassTaxonomy.deleteMany());

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`\n=== Done. Removed ${total} row(s) across ${Object.keys(counts).length} tables ===`);
    console.log('Preserved: users, tenants, roles, auth, AI settings, document format settings.');
  } finally {
    await prisma.$disconnect();
  }
}

wipe().catch((err) => {
  console.error(err);
  process.exit(1);
});
