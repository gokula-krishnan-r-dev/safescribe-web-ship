import {
  mapLegacyCategoryToSection,
  mapLegacyCategoryToType,
  mapRecommendationToPriority,
  resolveGuidanceSection,
  typesForOutputSection,
} from '@safescript/shared';

describe('patient guidance mapping', () => {
  it('maps education, self-care, and follow-up legacy categories', () => {
    expect(mapLegacyCategoryToSection('Medication counselling')).toBe('what_to_expect');
    expect(mapLegacyCategoryToSection('Non-drug advice')).toBe('self_care');
    expect(mapLegacyCategoryToSection('Follow-up')).toBe('follow_up');
    expect(mapLegacyCategoryToSection('When to seek urgent care')).toBe('follow_up');
  });

  it('maps HSV-style non-drug titles to self-care types', () => {
    expect(mapLegacyCategoryToType('Non-drug advice', 'self_care')).toBe('lifestyle');
    expect(mapLegacyCategoryToType('Hygiene', 'self_care')).toBe('hygiene');
    expect(mapLegacyCategoryToType('Prevention', 'self_care')).toBe('prevention');
  });

  it('keeps type lists partitioned by output section', () => {
    expect(typesForOutputSection('what_to_expect')).toContain('condition_education');
    expect(typesForOutputSection('self_care')).toContain('transmission_reduction');
    expect(typesForOutputSection('follow_up')).toContain('urgent_care');
  });

  it('maps first-line treatments to first_line priority', () => {
    expect(mapRecommendationToPriority('FIRST_LINE')).toBe('first_line');
    expect(mapRecommendationToPriority('ALTERNATIVE')).toBe('alternative');
  });

  it('honours explicit outputSection over a mismatched legacy category', () => {
    expect(resolveGuidanceSection('self_care', 'Follow-up')).toBe('self_care');
  });

  it('falls back from category when outputSection is missing', () => {
    expect(resolveGuidanceSection(null, 'Lifestyle')).toBe('self_care');
    expect(resolveGuidanceSection('follow_up', 'Medication counselling')).toBe('follow_up');
  });

  it('maps ChatGPT Patient Guidance headings onto output sections', () => {
    expect(mapLegacyCategoryToSection('Education & what to expect')).toBe('what_to_expect');
    expect(mapLegacyCategoryToSection('Self-care & non-drug measures')).toBe('self_care');
    expect(mapLegacyCategoryToSection('Follow-up & when to seek care')).toBe('follow_up');
  });
});
