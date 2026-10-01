import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { faxContactKeys, type PharmacyFaxContact } from './types';

const BASE = '/fax-contacts';

/** Active contacts for Send Fax autofill (pharmacists + admins). */
export function usePharmacyFaxContacts(enabled = true) {
  return useQuery({
    queryKey: faxContactKeys.active(),
    queryFn: () => api.get<PharmacyFaxContact[]>(BASE),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/** Full directory for pharmacy admin management. */
export function useManageFaxContacts() {
  return useQuery({
    queryKey: faxContactKeys.manage(),
    queryFn: () => api.get<PharmacyFaxContact[]>(`${BASE}/manage`),
  });
}

export function useCreateFaxContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      faxNumber: string;
      notes?: string;
      isActive?: boolean;
    }) => api.post<PharmacyFaxContact>(BASE, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: faxContactKeys.all });
    },
  });
}

export function useUpdateFaxContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      faxNumber?: string;
      notes?: string | null;
      isActive?: boolean;
      displayOrder?: number;
    }) => api.patch<PharmacyFaxContact>(`${BASE}/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: faxContactKeys.all });
    },
  });
}

export function useDeleteFaxContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`${BASE}/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: faxContactKeys.all });
    },
  });
}
