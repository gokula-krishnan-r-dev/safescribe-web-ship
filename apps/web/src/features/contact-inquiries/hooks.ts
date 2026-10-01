'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContactInquiryStatus, ContactTopic, PaginatedResponse } from '@safescript/shared';
import { api } from '@/lib/api-client';

export interface ContactInquiryListItem {
  id: string;
  fullName: string;
  workEmail: string;
  organization: string;
  topic: ContactTopic | string;
  topicLabel: string;
  preview: string;
  status: ContactInquiryStatus | string;
  createdAt: string;
  updatedAt: string;
}

export interface ContactInquiryDetail extends Omit<ContactInquiryListItem, 'preview'> {
  message: string;
  internalNote: string | null;
  handledAt: string | null;
  handledBy: { id: string; fullName: string } | null;
  ipAddress: string | null;
}

export interface ContactInquiryCounts {
  all: number;
  new: number;
  open: number;
  closed: number;
}

export type ContactInquiryListResponse = PaginatedResponse<ContactInquiryListItem> & {
  counts: ContactInquiryCounts;
};

export interface ContactInquiryListParams {
  page?: number;
  limit?: number;
  search?: string;
  topic?: string;
  status?: string;
}

function toQuery(params: ContactInquiryListParams) {
  const qs = new URLSearchParams();
  qs.set('page', String(params.page ?? 1));
  qs.set('limit', String(params.limit ?? 20));
  if (params.search) qs.set('search', params.search);
  if (params.topic) qs.set('topic', params.topic);
  if (params.status) qs.set('status', params.status);
  return qs.toString();
}

export function useContactInquiries(params: ContactInquiryListParams) {
  return useQuery({
    queryKey: ['contact-inquiries', params],
    queryFn: () => api.get<ContactInquiryListResponse>(`/contact/inquiries?${toQuery(params)}`),
  });
}

export function useContactInquirySummary() {
  return useQuery({
    queryKey: ['contact-inquiries-summary'],
    queryFn: () => api.get<ContactInquiryCounts>('/contact/inquiries/summary'),
    staleTime: 30_000,
  });
}

export function useContactInquiry(id: string | null) {
  return useQuery({
    queryKey: ['contact-inquiry', id],
    queryFn: () => api.get<ContactInquiryDetail>(`/contact/inquiries/${id}`),
    enabled: !!id,
  });
}

export function useUpdateContactInquiry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      status?: ContactInquiryStatus;
      internalNote?: string;
    }) => api.patch<ContactInquiryDetail>(`/contact/inquiries/${id}`, body),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['contact-inquiries'] });
      void queryClient.invalidateQueries({ queryKey: ['contact-inquiries-summary'] });
      queryClient.setQueryData(['contact-inquiry', data.id], data);
    },
  });
}
