import { isReusableBlankWorkspace } from './blank-workspace.util';

const blankPrescribe = {
  status: 'DRAFT',
  currentStep: 'PRESENTING_COMPLAINT',
  stepIndex: 0,
  module: 'prescribe',
};

describe('isReusableBlankWorkspace', () => {
  it('reuses an unused prescribe draft so login does not mint duplicates', () => {
    expect(isReusableBlankWorkspace(blankPrescribe)).toBe(true);
  });

  it('does not resume an in-progress or already-started consultation', () => {
    expect(
      isReusableBlankWorkspace({
        ...blankPrescribe,
        status: 'IN_PROGRESS',
        chiefComplaint: 'cold sore',
      }),
    ).toBe(false);
    expect(
      isReusableBlankWorkspace({
        ...blankPrescribe,
        chiefComplaint: 'cold sore',
      }),
    ).toBe(false);
    expect(
      isReusableBlankWorkspace({
        ...blankPrescribe,
        selectedPathwayId: 'pathway-1',
      }),
    ).toBe(false);
    expect(
      isReusableBlankWorkspace({
        ...blankPrescribe,
        currentStep: 'TREATMENT',
        stepIndex: 4,
      }),
    ).toBe(false);
  });

  it('does not reuse a renew workspace once medications have been captured', () => {
    expect(
      isReusableBlankWorkspace({
        status: 'DRAFT',
        currentStep: 'RENEW_MEDICATIONS',
        stepIndex: 0,
        module: 'renew',
        renewMedicationCount: 2,
      }),
    ).toBe(false);
    expect(
      isReusableBlankWorkspace({
        status: 'DRAFT',
        currentStep: 'RENEW_MEDICATIONS',
        stepIndex: 0,
        module: 'renew',
        renewMedicationCount: 0,
      }),
    ).toBe(true);
  });
});
