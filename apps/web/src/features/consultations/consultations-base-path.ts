import { ROLES } from '@safescript/shared';

export function consultationsBasePath(role: string | null | undefined): string {
  return role === ROLES.PHARMACIST_ADMIN ? '/admin/consultations' : '/pharmacist/consultations';
}

export function renewBasePath(role: string | null | undefined): string {
  return role === ROLES.PHARMACIST_ADMIN ? '/admin/renew' : '/pharmacist/renew';
}

export function adaptBasePath(role: string | null | undefined): string {
  return role === ROLES.PHARMACIST_ADMIN ? '/admin/adapt' : '/pharmacist/adapt';
}
