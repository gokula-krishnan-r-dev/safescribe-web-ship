export type PharmacyFaxContact = {
  id: string;
  name: string;
  faxNumber: string;
  notes: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export const faxContactKeys = {
  all: ['fax-contacts'] as const,
  active: () => [...faxContactKeys.all, 'active'] as const,
  manage: () => [...faxContactKeys.all, 'manage'] as const,
};
