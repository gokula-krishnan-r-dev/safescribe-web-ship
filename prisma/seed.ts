import 'dotenv/config';
import { PrismaClient, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  PHARMACIST_ADMIN: 'PHARMACIST_ADMIN',
  PHARMACIST: 'PHARMACIST',
} as const;

const PERMISSIONS = [
  { name: 'users:read', module: 'users', action: 'read' },
  { name: 'users:create', module: 'users', action: 'create' },
  { name: 'users:update', module: 'users', action: 'update' },
  { name: 'users:delete', module: 'users', action: 'delete' },
  { name: 'tenants:read', module: 'tenants', action: 'read' },
  { name: 'tenants:create', module: 'tenants', action: 'create' },
  { name: 'tenants:update', module: 'tenants', action: 'update' },
  { name: 'audit:read', module: 'audit', action: 'read' },
];

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function validateSeedPassword(password: string) {
  if (password.length < 8) {
    throw new Error('SUPER_ADMIN_PASSWORD must be at least 8 characters');
  }
}

async function upsertPlatformAdmin(opts: {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  scope: 'FULL' | 'PHARMACY' | 'CLINICAL';
  roleId: string;
}) {
  const existing = await prisma.user.findFirst({
    where: { email: { equals: opts.email, mode: 'insensitive' }, tenantId: null, deletedAt: null },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash: opts.passwordHash,
        status: UserStatus.ACTIVE,
        roleId: opts.roleId,
        superAdminScope: opts.scope,
        emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
      },
    });
    return;
  }

  await prisma.user.create({
    data: {
      email: opts.email,
      passwordHash: opts.passwordHash,
      firstName: opts.firstName,
      lastName: opts.lastName,
      status: UserStatus.ACTIVE,
      roleId: opts.roleId,
      superAdminScope: opts.scope,
      emailVerifiedAt: new Date(),
    },
  });
}

async function main() {
  console.log('Seeding database...');

  const superAdminEmail = requireEnv('SUPER_ADMIN_EMAIL', 'admin@safescript.com');
  const superAdminPassword = requireEnv('SUPER_ADMIN_PASSWORD', 'SuperAdmin123!');
  validateSeedPassword(superAdminPassword);

  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: {},
      create: perm,
    });
  }

  const superAdminRole = await prisma.role.upsert({
    where: { name: ROLES.SUPER_ADMIN },
    update: {},
    create: {
      name: ROLES.SUPER_ADMIN,
      displayName: 'Super Admin',
      description: 'Platform-wide administrator',
      isSystem: true,
    },
  });

  const pharmacistAdminRole = await prisma.role.upsert({
    where: { name: ROLES.PHARMACIST_ADMIN },
    update: {},
    create: {
      name: ROLES.PHARMACIST_ADMIN,
      displayName: 'Pharmacist Admin',
      description: 'Organization administrator',
      isSystem: true,
    },
  });

  const pharmacistRole = await prisma.role.upsert({
    where: { name: ROLES.PHARMACIST },
    update: {},
    create: {
      name: ROLES.PHARMACIST,
      displayName: 'Pharmacist',
      description: 'Standard pharmacist user',
      isSystem: true,
    },
  });

  const allPermissions = await prisma.permission.findMany();
  const adminPerms = allPermissions.filter((p) =>
    ['users:read', 'users:create', 'users:update', 'users:delete', 'audit:read'].includes(p.name),
  );

  for (const perm of allPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: superAdminRole.id, permissionId: perm.id } },
      update: {},
      create: { roleId: superAdminRole.id, permissionId: perm.id },
    });
  }

  for (const perm of adminPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: pharmacistAdminRole.id, permissionId: perm.id } },
      update: {},
      create: { roleId: pharmacistAdminRole.id, permissionId: perm.id },
    });
  }

  const passwordHash = await argon2.hash(superAdminPassword);

  const fullAdminEmail = superAdminEmail.trim().toLowerCase();
  const pharmacyAdminEmail = requireEnv(
    'SUPER_ADMIN_PHARMACY_EMAIL',
    'pharmacy-admin@safescript.com',
  ).trim().toLowerCase();
  const clinicalAdminEmail = requireEnv(
    'SUPER_ADMIN_CLINICAL_EMAIL',
    'clinical-admin@safescript.com',
  ).trim().toLowerCase();

  await upsertPlatformAdmin({
    email: fullAdminEmail,
    passwordHash,
    firstName: 'Super',
    lastName: 'Admin',
    scope: 'FULL',
    roleId: superAdminRole.id,
  });

  if (pharmacyAdminEmail !== fullAdminEmail) {
    await upsertPlatformAdmin({
      email: pharmacyAdminEmail,
      passwordHash,
      firstName: 'Pharmacy',
      lastName: 'Admin',
      scope: 'PHARMACY',
      roleId: superAdminRole.id,
    });
  }

  if (clinicalAdminEmail !== fullAdminEmail && clinicalAdminEmail !== pharmacyAdminEmail) {
    await upsertPlatformAdmin({
      email: clinicalAdminEmail,
      passwordHash,
      firstName: 'Clinical',
      lastName: 'Admin',
      scope: 'CLINICAL',
      roleId: superAdminRole.id,
    });
  }

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-pharmacy' },
    update: {},
    create: { name: 'Demo Pharmacy', slug: 'demo-pharmacy' },
  });

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@demo-pharmacy.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@demo-pharmacy.com',
      passwordHash: await argon2.hash('Admin123!'),
      firstName: 'Jane',
      lastName: 'Admin',
      status: UserStatus.ACTIVE,
      roleId: pharmacistAdminRole.id,
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'pharmacist@demo-pharmacy.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'pharmacist@demo-pharmacy.com',
      passwordHash: await argon2.hash('Pharmacist123!'),
      firstName: 'John',
      lastName: 'Pharmacist',
      status: UserStatus.ACTIVE,
      roleId: pharmacistRole.id,
      emailVerifiedAt: new Date(),
    },
  });

  // Universal Clinical Judgment workflow version (no condition modules)
  await prisma.clinicalJudgmentWorkflowVersion.upsert({
    where: { version: '1.0.0' },
    update: {
      status: 'APPROVED',
      effectiveAt: new Date(),
      configuration: {
        fields: {
          workingDiagnosisMin: 3,
          workingDiagnosisMax: 250,
          assessmentSummaryMin: 10,
          assessmentSummaryMax: 4000,
          readinessReasonMin: 10,
          readinessReasonMax: 2000,
        },
        features: {
          aiAssessmentSummary: true,
          aiRationaleDrafts: true,
          noAlternativesPermitted: true,
        },
      },
      promptBundleVersion: 'cj-prompts-v1',
    },
    create: {
      version: '1.0.0',
      status: 'APPROVED',
      effectiveAt: new Date(),
      approvedAt: new Date(),
      configuration: {
        fields: {
          workingDiagnosisMin: 3,
          workingDiagnosisMax: 250,
          assessmentSummaryMin: 10,
          assessmentSummaryMax: 4000,
          readinessReasonMin: 10,
          readinessReasonMax: 2000,
        },
        features: {
          aiAssessmentSummary: true,
          aiRationaleDrafts: true,
          noAlternativesPermitted: true,
        },
      },
      promptBundleVersion: 'cj-prompts-v1',
    },
  });

  console.log('Seed completed.');
  console.log(`Full Super Admin: ${fullAdminEmail}`);
  console.log(`Pharmacy Super Admin: ${pharmacyAdminEmail}`);
  console.log(`Clinical Super Admin: ${clinicalAdminEmail}`);
  console.log('Pharmacist Admin: admin@demo-pharmacy.com / Admin123!');
  console.log('Pharmacist: pharmacist@demo-pharmacy.com / Pharmacist123!');

  try {
    const { spawnSync } = await import('node:child_process');
    console.log('\nSeeding Renew workflow configuration from workbooks...');
    const result = spawnSync('pnpm', ['db:seed:renew-workflow'], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env,
    });
    if (result.status !== 0) {
      console.warn('Renew workflow workbook seed did not complete. Run: pnpm db:seed:renew-workflow');
    }
    console.log('\nSeeding Clinical Safety Reference & Target Values...');
    const references = spawnSync('pnpm', ['db:seed:clinical-references'], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env,
    });
    if (references.status !== 0) {
      console.warn('Clinical reference seed did not complete. Run: pnpm db:seed:clinical-references');
    }
  } catch (err) {
    console.warn(
      'Renew workflow workbook seed skipped:',
      err instanceof Error ? err.message : err,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
