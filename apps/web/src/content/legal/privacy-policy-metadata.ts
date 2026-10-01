export const PRIVACY_CONTACT_EMAIL = 'Privacy@pharmasafe.ca';

export const privacyPolicyMeta = {
  effectiveDate: '2026-08-11',
  lastUpdated: '2026-08-11',
  lastUpdatedLabel: '11 August 2026',
  organization: 'PharmaSafe Inc.',
  location: 'Edmonton, Alberta, Canada',
  consultationDeletion: {
    onCompletion: true,
    fallbackTimezone: 'America/Edmonton',
    fallbackTime: '00:00',
    rule: 'whichever_occurs_first' as const,
  },
} as const;
