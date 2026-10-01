/**
 * One-time read-only copy of verified Phix pharmacies into SafeScribe.
 *
 *   PHIX_READONLY_DATABASE_URL=... DATABASE_URL=... pnpm --filter @safescript/api exec tsx src/scripts/migrate-phix-users.ts
 *   ... --apply
 *
 * Never writes to Phix. Sets default_transaction_read_only on the Phix session.
 */
import { PrismaClient, TenantStatus, UserStatus } from '@prisma/client';
import { Client } from 'pg';
import { DEFAULT_PRESCRIBE_DAILY_INCLUDED, ROLES, SAFESCRIBE_MODULES } from '@safescript/shared';
import { mapPhixRolesToSafescribe, slugifyPharmacyName, splitDisplayName } from '../modules/phix-sync/phix-mapping';

interface PhixPharmacyRow {
  id: string;
  pharmacyName: string;
  pharmacyLicenseNumber: string;
  pharmacyPhoneNumber: string | null;
  pharmacyFaxNumber: string | null;
}

interface PhixUserRow {
  id: string;
  email: string;
  displayName: string | null;
  hashedPassword: string;
  isActive: boolean;
  roles: string[];
  pharmacyId: string;
}

function argFlag(name: string): boolean {
  return process.argv.includes(name);
}

function phixClientConfig(connectionString: string) {
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: process.env.PHIX_READONLY_SSL_STRICT === 'true' },
  };
}

async function main() {
  const apply = argFlag('--apply');
  const phixUrl = process.env.PHIX_READONLY_DATABASE_URL;
  if (!phixUrl) {
    throw new Error('PHIX_READONLY_DATABASE_URL is required');
  }
  if (apply && !process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL (SafeScribe) is required for --apply');
  }

  const phix = new Client(phixClientConfig(phixUrl));
  const prisma = apply ? new PrismaClient() : null;

  await phix.connect();
  await phix.query('SET default_transaction_read_only = on');
  await phix.query('SET statement_timeout = 60000');

  const pharmacies = (
    await phix.query<PhixPharmacyRow>(
      `SELECT id, "pharmacyName", "pharmacyLicenseNumber", "pharmacyPhoneNumber", "pharmacyFaxNumber"
       FROM "Pharmacy"
       WHERE "isVerified" = true AND "isSuspended" = false
       ORDER BY "createdAt" ASC`,
    )
  ).rows;

  const adminRole = apply
    ? await prisma!.role.findUnique({ where: { name: ROLES.PHARMACIST_ADMIN } })
    : { id: 'dry-run-admin' };
  const pharmacistRole = apply
    ? await prisma!.role.findUnique({ where: { name: ROLES.PHARMACIST } })
    : { id: 'dry-run-pharmacist' };
  if (!adminRole || !pharmacistRole) {
    throw new Error('SafeScribe roles are not seeded');
  }

  const memberRows = (
    await phix.query<PhixUserRow>(
      `SELECT u.id, u.email, u."displayName", u."hashedPassword", up."isActive", up.roles::text[] AS roles, up."pharmacyId"
       FROM "UserPharmacy" up
       JOIN users u ON u.id = up."userId"
       JOIN "Pharmacy" p ON p.id = up."pharmacyId"
       WHERE p."isVerified" = true
         AND p."isSuspended" = false
         AND u."hashedPassword" IS NOT NULL
         AND u."hashedPassword" <> ''
       ORDER BY u."createdAt" ASC`,
    )
  ).rows;
  const membersByPharmacy = new Map<string, PhixUserRow[]>();
  for (const row of memberRows) {
    const list = membersByPharmacy.get(row.pharmacyId) ?? [];
    list.push(row);
    membersByPharmacy.set(row.pharmacyId, list);
  }

  const summary = { pharmacies: 0, users: 0, skippedUsers: 0, errors: [] as string[] };
  console.log(
    `${apply ? 'APPLY' : 'DRY-RUN'}: ${pharmacies.length} verified Phix pharmacies, ${memberRows.length} users with passwords`,
  );

  for (const pharmacy of pharmacies) {
    try {
      const members = membersByPharmacy.get(pharmacy.id) ?? [];

      if (apply && prisma) {
        await prisma.$transaction(async (tx) => {
          const existing = await tx.tenant.findUnique({
            where: { phixPharmacyId: pharmacy.id },
          });
          const tenant = existing
            ? await tx.tenant.update({
                where: { id: existing.id },
                data: {
                  name: pharmacy.pharmacyName,
                  pharmacyLicenseNumber: pharmacy.pharmacyLicenseNumber,
                  phone: pharmacy.pharmacyPhoneNumber,
                  faxNumber: pharmacy.pharmacyFaxNumber,
                  phixCustomer: true,
                  status: TenantStatus.ACTIVE,
                },
              })
            : await tx.tenant.create({
                data: {
                  name: pharmacy.pharmacyName,
                  slug: slugifyPharmacyName(pharmacy.pharmacyName, pharmacy.id),
                  pharmacyLicenseNumber: pharmacy.pharmacyLicenseNumber,
                  phone: pharmacy.pharmacyPhoneNumber,
                  faxNumber: pharmacy.pharmacyFaxNumber,
                  phixCustomer: true,
                  phixPharmacyId: pharmacy.id,
                  status: TenantStatus.ACTIVE,
                },
              });

          await tx.safeScribeEntitlement.upsert({
            where: {
              tenantId_module: { tenantId: tenant.id, module: SAFESCRIBE_MODULES.PRESCRIBE },
            },
            update: {},
            create: {
              tenantId: tenant.id,
              module: SAFESCRIBE_MODULES.PRESCRIBE,
              includedQuantity: DEFAULT_PRESCRIBE_DAILY_INCLUDED,
              period: 'daily',
              active: true,
            },
          });

          for (const member of members) {
            const email = member.email.trim().toLowerCase();
            if (!email) {
              summary.skippedUsers += 1;
              continue;
            }
            const roleName = mapPhixRolesToSafescribe(member.roles ?? []);
            const roleId = roleName === ROLES.PHARMACIST_ADMIN ? adminRole.id : pharmacistRole.id;
            const { firstName, lastName } = splitDisplayName(member.displayName);
            const status = member.isActive ? UserStatus.ACTIVE : UserStatus.SUSPENDED;
            const existingUser = await tx.user.findFirst({
              where: { tenantId: tenant.id, phixUserId: member.id },
            });
            if (existingUser) {
              await tx.user.update({
                where: { id: existingUser.id },
                data: {
                  email,
                  firstName,
                  lastName,
                  roleId,
                  status,
                  passwordHash: member.hashedPassword,
                  deletedAt: null,
                },
              });
            } else {
              const byEmail = await tx.user.findFirst({
                where: { tenantId: tenant.id, email, deletedAt: null },
              });
              if (byEmail) {
                await tx.user.update({
                  where: { id: byEmail.id },
                  data: {
                    phixUserId: member.id,
                    firstName,
                    lastName,
                    roleId,
                    status,
                    passwordHash: member.hashedPassword,
                  },
                });
              } else {
                await tx.user.create({
                  data: {
                    email,
                    passwordHash: member.hashedPassword,
                    firstName,
                    lastName,
                    tenantId: tenant.id,
                    roleId,
                    status,
                    phixUserId: member.id,
                    emailVerifiedAt: new Date(),
                  },
                });
              }
            }
            summary.users += 1;
          }
        });
      } else {
        summary.users += members.length;
      }
      summary.pharmacies += 1;
      if (argFlag('--verbose')) {
        console.log(
          `  ${pharmacy.pharmacyName} (${pharmacy.pharmacyLicenseNumber}) — ${members.length} users`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.errors.push(`${pharmacy.id}: ${message}`);
      console.error(`  FAILED ${pharmacy.pharmacyName}: ${message}`);
    }
  }

  await phix.end();
  if (prisma) await prisma.$disconnect();
  console.log(JSON.stringify({ apply, ...summary }, null, 2));
  if (summary.errors.length) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
