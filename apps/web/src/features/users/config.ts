import type { PaginatedUsers, UserListItem } from '@/lib/api-client';

export type UserType = 'pharmacist-admin' | 'pharmacist';

export interface UserModuleConfig {
  type: UserType;
  basePath: string;
  listEndpoint: string;
  createEndpoint: string;
  title: string;
  singularTitle: string;
  description: string;
  showOrganization?: boolean;
  requireOrganization?: boolean;
  showPharmacyAssignment?: boolean;
}

export const PHARMACIST_ADMIN_CONFIG: UserModuleConfig = {
  type: 'pharmacist-admin',
  basePath: '/super-admin/pharmacist-admins',
  listEndpoint: '/users/pharmacist-admins',
  createEndpoint: '/users/pharmacist-admins',
  title: 'Pharmacist Admins',
  singularTitle: 'Pharmacist Admin',
  description: 'Manage pharmacy admins across the platform',
  showOrganization: true,
  requireOrganization: true,
  showPharmacyAssignment: true,
};

export const PHARMACIST_CONFIG: UserModuleConfig = {
  type: 'pharmacist',
  basePath: '/admin/pharmacists',
  listEndpoint: '/users/pharmacists',
  createEndpoint: '/users/pharmacists',
  title: 'Manage Pharmacy Users',
  singularTitle: 'Pharmacist',
  description: 'Monitor roles, access, and engagement across your pharmacy team.',
};

export type { PaginatedUsers, UserListItem };
