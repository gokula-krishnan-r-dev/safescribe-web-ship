import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRequestedTags,
  calculateCoverage,
  dedupeAndMergeReferences,
  linkReferencesToFindings,
  scoreCandidateReference,
  selectAdaptReferences,
  type CandidateReference,
  type SelectedAdaptReference,
} from './adapt-reference-selector';

describe('AdaptReferenceSelector', () => {
  describe('Tag Mappings (Cases 1–6)', () => {
    it('1. maps dose + renal adaptation to dose, renal, and monitoring_follow_up tags', () => {
      const tags = buildRequestedTags({
        adaptationType: 'dose',
        adaptationReasonCode: 'DOSE_RENAL',
        triggeredCheckCodes: ['renal_function', 'dose_regimen'],
      });

      assert.ok(tags.includes('dose'));
      assert.ok(tags.includes('renal'));
      assert.ok(tags.includes('monitoring_follow_up'));
      assert.ok(tags.includes('regimen_frequency'));
    });

    it('2. maps dosage form adaptation to formulation, route, adherence, and counselling', () => {
      const tags = buildRequestedTags({
        adaptationType: 'dosage_form',
        adaptationReasonCode: 'FORM_SWALLOWING',
      });

      assert.ok(tags.includes('dosage_form_formulation'));
      assert.ok(tags.includes('route_administration'));
      assert.ok(tags.includes('adherence_use'));
      assert.ok(tags.includes('counselling_patient_guidance'));
    });

    it('3. maps regimen/adherence adaptation to regimen_frequency and adherence_use', () => {
      const tags = buildRequestedTags({
        adaptationType: 'regimen',
        adaptationReasonCode: 'REGIMEN_ADHERENCE',
      });

      assert.ok(tags.includes('regimen_frequency'));
      assert.ok(tags.includes('adherence_use'));
    });

    it('4. maps route adaptation to route_administration and contraindications_precautions', () => {
      const tags = buildRequestedTags({
        adaptationType: 'route',
        adaptationReasonCode: 'ROUTE_CLINICAL_NEED',
      });

      assert.ok(tags.includes('route_administration'));
      assert.ok(tags.includes('treatment_place_in_therapy'));
      assert.ok(tags.includes('contraindications_precautions'));
    });

    it('5. maps therapeutic substitution to therapeutic_substitution, allergies, interactions, and precautions', () => {
      const tags = buildRequestedTags({
        adaptationType: 'therapeutic_substitution',
        adaptationReasonCode: 'SUB_ALLERGY',
      });

      assert.ok(tags.includes('therapeutic_substitution'));
      assert.ok(tags.includes('allergies_hypersensitivity'));
      assert.ok(tags.includes('treatment_place_in_therapy'));
      assert.ok(tags.includes('contraindications_precautions'));
    });

    it('6. handles unknown reason code fallback gracefully without crashing', () => {
      const tags = buildRequestedTags({
        adaptationType: 'dose',
        adaptationReasonCode: 'UNKNOWN_REASON_CODE_XYZ',
        triggeredCheckCodes: ['dose_regimen'],
      });

      assert.ok(tags.includes('dose'));
      assert.ok(tags.includes('regimen_frequency'));
      assert.ok(tags.includes('monitoring_follow_up'));
    });
  });

  describe('Pathway & Jurisdiction Selection (Cases 7–10)', () => {
    const CANDIDATES: CandidateReference[] = [
      {
        id: 'ref_path_ab',
        title: 'Alberta Cystitis Adaptation Clinical Guidance',
        organizationPublisher: 'Alberta Health Services',
        documentType: 'provincial_guideline',
        jurisdiction: 'AB',
        yearEdition: '2024',
        status: 'approved',
        verificationRequired: false,
        tags: ['dose', 'renal', 'monitoring_follow_up'],
        pathwayId: 'path_cystitis',
      },
      {
        id: 'ref_path_ca',
        title: 'Canadian Guidelines for Antimicrobial Dosing in Renal Impairment',
        organizationPublisher: 'Health Canada',
        documentType: 'health_canada',
        jurisdiction: 'CA',
        yearEdition: '2023',
        status: 'approved',
        verificationRequired: false,
        tags: ['dose', 'renal'],
        pathwayId: 'path_cystitis',
      },
    ];

    it('7. matches pathway exactly and scores higher', () => {
      const res = selectAdaptReferences(
        {
          consultationId: 'c1',
          jurisdiction: 'AB',
          pathwayId: 'path_cystitis',
          adaptationType: 'dose',
          adaptationReasonCode: 'DOSE_RENAL',
          includeSafetyRuleReferences: false,
        },
        CANDIDATES,
      );

      assert.equal(res.pathwayMatched, true);
      assert.equal(res.pathwayReferences.length, 2);
      assert.equal(res.coverage.hasPathwayReference, true);
    });

    it('8. handles missing pathway gracefully and logs warning without blocking', () => {
      const res = selectAdaptReferences(
        {
          consultationId: 'c2',
          jurisdiction: 'AB',
          pathwayId: 'unmatched_pathway_999',
          adaptationType: 'dose',
          adaptationReasonCode: 'DOSE_RENAL',
          includeSafetyRuleReferences: false,
        },
        [],
      );

      assert.equal(res.pathwayMatched, true);
      assert.equal(res.pathwayReferences.length, 0);
      assert.ok(res.warnings.some((w) => w.code === 'NO_PATHWAY_MATCH'));
    });

    it('9. prefers exact province reference over Canada where appropriate', () => {
      const res = selectAdaptReferences(
        {
          consultationId: 'c3',
          jurisdiction: 'AB',
          pathwayId: 'path_cystitis',
          adaptationType: 'dose',
          adaptationReasonCode: 'DOSE_RENAL',
          includeSafetyRuleReferences: false,
        },
        CANDIDATES,
      );

      // Alberta reference should receive exactJurisdictionMatch (2 pts)
      const abRef = res.pathwayReferences.find((r) => r.referenceId === 'ref_path_ab');
      const caRef = res.pathwayReferences.find((r) => r.referenceId === 'ref_path_ca');
      assert.ok(abRef);
      assert.ok(caRef);
      assert.ok(abRef.priorityScore >= caRef.priorityScore);
    });

    it('10. uses Canada reference when no provincial reference exists', () => {
      const canadaOnly: CandidateReference[] = [
        {
          id: 'ref_canada_only',
          title: 'CPS Dosing Guide',
          organizationPublisher: 'CPhA',
          documentType: 'cps',
          jurisdiction: 'CA',
          yearEdition: '2024',
          status: 'approved',
          verificationRequired: false,
          tags: ['dose'],
          pathwayId: 'path_general',
        },
      ];

      const res = selectAdaptReferences(
        {
          consultationId: 'c4',
          jurisdiction: 'ON',
          pathwayId: 'path_general',
          adaptationType: 'dose',
          adaptationReasonCode: 'DOSE_OTHER',
          includeSafetyRuleReferences: false,
        },
        canadaOnly,
      );

      assert.equal(res.pathwayReferences.length, 1);
      assert.equal(res.pathwayReferences[0].referenceId, 'ref_canada_only');
    });
  });

  describe('Eligibility, Safety Engine & Deduplication (Cases 11–15)', () => {
    it('11. excludes unapproved references (needs_review, draft, archived)', () => {
      const unapproved: CandidateReference[] = [
        {
          id: 'ref_draft',
          title: 'Draft Unapproved Monograph',
          status: 'needs_review',
          verificationRequired: false,
          tags: ['dose'],
        },
        {
          id: 'ref_archived',
          title: 'Old Archived Monograph',
          status: 'archived',
          verificationRequired: false,
          tags: ['dose'],
        },
      ];

      const res = selectAdaptReferences(
        {
          consultationId: 'c5',
          jurisdiction: 'AB',
          adaptationType: 'dose',
          adaptationReasonCode: 'DOSE_OTHER',
          includeSafetyRuleReferences: false,
        },
        unapproved,
      );

      assert.equal(res.pathwayReferences.length, 0);
    });

    it('12. excludes verification-required references from automatic selection', () => {
      const verificationReq: CandidateReference[] = [
        {
          id: 'ref_unverified',
          title: 'Unverified Reference',
          status: 'approved',
          verificationRequired: true,
          tags: ['dose'],
        },
      ];

      const res = selectAdaptReferences(
        {
          consultationId: 'c6',
          jurisdiction: 'AB',
          adaptationType: 'dose',
          adaptationReasonCode: 'DOSE_OTHER',
          includeSafetyRuleReferences: false,
        },
        verificationReq,
      );

      assert.equal(res.pathwayReferences.length, 0);
    });

    it('13. includes Safety Engine rule references when triggered', () => {
      const res = selectAdaptReferences({
        consultationId: 'c7',
        jurisdiction: 'AB',
        adaptationType: 'dose',
        adaptationReasonCode: 'DOSE_RENAL',
        triggeredCheckCodes: ['renal_function'],
        triggeredRuleIds: ['METFORMIN_RENAL_45'],
      });

      assert.ok(res.safetyRuleReferences.length >= 1);
      const metforminRef = res.safetyRuleReferences.find(
        (r) => r.referenceId === 'ref_metformin_mono_renal',
      );
      assert.ok(metforminRef);
      assert.equal(metforminRef.source, 'safety_rule');
      assert.ok(metforminRef.relevantSections?.includes('Section 7.2 — Renal Impairment & Dose Adjustments'));
    });

    it('14. deduplicates pathway and Safety Engine sources with same referenceId or title', () => {
      const duplicatePathway: CandidateReference[] = [
        {
          id: 'ref_metformin_mono_renal',
          title: 'Metformin Product Monograph (Canada, 2023)',
          organizationPublisher: 'Health Canada / Product Monograph',
          documentType: 'product_monograph',
          jurisdiction: 'CA',
          status: 'approved',
          tags: ['dose', 'renal'],
        },
      ];

      const res = selectAdaptReferences(
        {
          consultationId: 'c8',
          jurisdiction: 'AB',
          adaptationType: 'dose',
          adaptationReasonCode: 'DOSE_RENAL',
          triggeredCheckCodes: ['renal_function'],
          triggeredRuleIds: ['METFORMIN_RENAL_45'],
        },
        duplicatePathway,
      );

      // Should deduplicate to 1 entry in allSelectedReferences
      const metforminMatches = res.allSelectedReferences.filter(
        (r) => r.referenceId === 'ref_metformin_mono_renal',
      );
      assert.equal(metforminMatches.length, 1);
      // Source should preserve safety_rule
      assert.equal(metforminMatches[0].source, 'safety_rule');
    });

    it('15. correctly calculates missing-tag coverage', () => {
      const coverage = calculateCoverage({
        requestedTags: ['dose', 'renal', 'monitoring_follow_up'],
        selectedReferences: [
          {
            referenceId: 'ref_1',
            title: 'Dose Only Reference',
            source: 'pathway_library',
            matchedTags: ['dose'],
            priorityScore: 10,
            displayReason: 'Dose',
            statusSnapshot: 'approved',
          },
        ],
      });

      assert.equal(coverage.hasAnySupportingReference, true);
      assert.equal(coverage.hasPathwayReference, true);
      assert.equal(coverage.hasSafetyRuleReference, false);
      assert.deepEqual(coverage.missingTags, ['renal', 'monitoring_follow_up']);
    });
  });

  describe('Ranking, Limits & Findings (Cases 16–19)', () => {
    it('16. handles no-reference result cleanly without throwing', () => {
      const res = selectAdaptReferences({
        consultationId: 'c9',
        jurisdiction: 'AB',
        adaptationType: 'other',
        adaptationReasonCode: 'OTHER',
        includeSafetyRuleReferences: false,
      });

      assert.equal(res.allSelectedReferences.length, 0);
      assert.equal(res.coverage.hasAnySupportingReference, false);
      assert.equal(res.coverage.hasPathwayReference, false);
      assert.equal(res.coverage.hasSafetyRuleReference, false);
    });

    it('17. sorts results descending by priorityScore', () => {
      const refs: SelectedAdaptReference[] = [
        {
          referenceId: 'low',
          title: 'Low priority',
          source: 'pathway_library',
          matchedTags: ['dose'],
          priorityScore: 5,
          displayReason: 'Low',
          statusSnapshot: 'approved',
        },
        {
          referenceId: 'high',
          title: 'High priority',
          source: 'pathway_library',
          matchedTags: ['dose', 'renal'],
          priorityScore: 18,
          displayReason: 'High',
          statusSnapshot: 'approved',
        },
        {
          referenceId: 'med',
          title: 'Medium priority',
          source: 'pathway_library',
          matchedTags: ['dose'],
          priorityScore: 11,
          displayReason: 'Medium',
          statusSnapshot: 'approved',
        },
      ];

      const deduped = dedupeAndMergeReferences(refs);
      assert.equal(deduped[0].referenceId, 'high');
      assert.equal(deduped[1].referenceId, 'med');
      assert.equal(deduped[2].referenceId, 'low');
    });

    it('18. respects limit behavior for excess pathway references', () => {
      const refs: SelectedAdaptReference[] = Array.from({ length: 10 }, (_, i) => ({
        referenceId: `ref_${i}`,
        title: `Pathway Ref ${i}`,
        source: 'pathway_library',
        matchedTags: ['dose'],
        priorityScore: 10 - i,
        displayReason: 'Pathway',
        statusSnapshot: 'approved',
      }));

      const deduped = dedupeAndMergeReferences(refs, 4);
      assert.equal(deduped.length, 4);
    });

    it('19. does not suppress critical Safety Engine references when limit is reached', () => {
      const pathwayRefs: SelectedAdaptReference[] = Array.from({ length: 6 }, (_, i) => ({
        referenceId: `path_${i}`,
        title: `Pathway Ref ${i}`,
        source: 'pathway_library',
        matchedTags: ['dose'],
        priorityScore: 20 - i,
        displayReason: 'Pathway',
        statusSnapshot: 'approved',
      }));

      const safetyRef: SelectedAdaptReference = {
        referenceId: 'safety_contraindication',
        title: 'CPS Beta-Lactam Hypersensitivity',
        source: 'safety_rule',
        matchedTags: ['allergies_hypersensitivity'],
        priorityScore: 15,
        displayReason: 'Safety',
        statusSnapshot: 'approved',
      };

      const deduped = dedupeAndMergeReferences([...pathwayRefs, safetyRef], 3);
      // Safety reference must be preserved!
      assert.ok(deduped.some((r) => r.referenceId === 'safety_contraindication'));
    });

    it('attaches primary and additional references at finding level', () => {
      const references: SelectedAdaptReference[] = [
        {
          referenceId: 'ref_renal',
          title: 'Renal Monograph',
          source: 'safety_rule',
          matchedTags: ['renal', 'dose'],
          matchedCheckCodes: ['renal_function'],
          priorityScore: 16,
          displayReason: 'Renal',
          statusSnapshot: 'approved',
        },
        {
          referenceId: 'ref_renal_second',
          title: 'Secondary Renal Guidance',
          source: 'pathway_library',
          matchedTags: ['renal'],
          matchedCheckCodes: ['renal_function'],
          priorityScore: 10,
          displayReason: 'Secondary',
          statusSnapshot: 'approved',
        },
        {
          referenceId: 'ref_allergy',
          title: 'Allergy Reference',
          source: 'safety_rule',
          matchedTags: ['allergies_hypersensitivity'],
          matchedCheckCodes: ['allergies'],
          priorityScore: 15,
          displayReason: 'Allergy',
          statusSnapshot: 'approved',
        },
      ];

      const links = linkReferencesToFindings({
        triggeredCheckCodes: ['renal_function', 'allergies'],
        selectedReferences: references,
      });

      assert.equal(links.renal_function.primaryReferenceId, 'ref_renal');
      assert.deepEqual(links.renal_function.additionalReferenceIds, ['ref_renal_second']);
      assert.equal(links.allergies.primaryReferenceId, 'ref_allergy');
      assert.deepEqual(links.allergies.additionalReferenceIds, []);
    });
  });
});
