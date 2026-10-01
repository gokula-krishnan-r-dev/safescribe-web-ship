export const CONTACT_SUPPORT_EMAIL = 'support@pharmasafe.ca';

export const CONTACT_TOPICS = {
  PRODUCT_SUPPORT: 'product_support',
  REQUEST_DEMO: 'request_demo',
  PARTNERSHIPS: 'partnerships',
} as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[keyof typeof CONTACT_TOPICS];

export const CONTACT_TOPIC_LABELS: Record<ContactTopic, string> = {
  product_support: 'Product support',
  request_demo: 'Request a demo',
  partnerships: 'Partnerships & general inquiries',
};

export const CONTACT_TOPIC_OPTIONS = [
  {
    value: CONTACT_TOPICS.PRODUCT_SUPPORT,
    label: CONTACT_TOPIC_LABELS.product_support,
    description: 'Get help with setup, usage, or technical questions.',
  },
  {
    value: CONTACT_TOPICS.REQUEST_DEMO,
    label: CONTACT_TOPIC_LABELS.request_demo,
    description: 'See how SafeScribe can streamline your workflow.',
  },
  {
    value: CONTACT_TOPICS.PARTNERSHIPS,
    label: CONTACT_TOPIC_LABELS.partnerships,
    description: 'Explore partnerships or other ways to connect.',
  },
] as const;

export const CONTACT_MESSAGE_MAX = 1000;

export const CONTACT_INQUIRY_STATUSES = {
  NEW: 'new',
  OPEN: 'open',
  CLOSED: 'closed',
} as const;

export type ContactInquiryStatus =
  (typeof CONTACT_INQUIRY_STATUSES)[keyof typeof CONTACT_INQUIRY_STATUSES];

export const CONTACT_INQUIRY_STATUS_LABELS: Record<ContactInquiryStatus, string> = {
  new: 'New',
  open: 'In progress',
  closed: 'Closed',
};

export const CONTACT_INQUIRY_NOTE_MAX = 2000;
