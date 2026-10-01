/**
 * Migrate legacy AllergyRuleDataset Excel data into DrugClassMembership table.
 * Run: npx tsx prisma/scripts/migrate-allergy-rules.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function main() {
  const active = await prisma.allergyRuleDataset.findFirst({
    where: { isActive: true, status: 'ACTIVE', parsingStatus: 'completed' },
    orderBy: { uploadedAt: 'desc' },
  });

  if (!active) {
    console.log('No active allergy rules dataset found. Skipping migration.');
    return;
  }

  const filePath = path.join(process.cwd(), active.storedName);
  const buffer = await fs.readFile(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const drugsSheet = workbook.SheetNames.find((s) => normalizeKey(s) === 'drugs');
  if (!drugsSheet) {
    console.error('Drugs sheet not found in legacy file.');
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[drugsSheet], {
    defval: '',
    raw: false,
  });

  let classesCreated = 0;
  for (const row of rows) {
    const drugName = normalizeKey(String(row.drug_name ?? row.Drug ?? row.drug ?? ''));
    const className = normalizeKey(String(row.class_name ?? row.Class ?? ''));
    if (!drugName || !className) continue;
    await prisma.drugClassMembership.upsert({
      where: { drugName_className: { drugName, className } },
      create: { drugName, className },
      update: {},
    });
    classesCreated++;
  }

  console.log(`Migrated ${classesCreated} drug-class rows from ${active.fileName}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
