import { Prisma } from '@prisma/client';
import {
  ACCESS_REQUEST_MATCH_TYPES,
  ACCESS_REQUEST_STATUSES,
  ACCESS_REQUEST_TABS,
  parseAccessRequestId,
  type AccessRequestTab,
} from '@safescript/shared';

export const OPEN_ACCESS_REQUEST_STATUSES = [
  ACCESS_REQUEST_STATUSES.PENDING,
  ACCESS_REQUEST_STATUSES.NEEDS_REVIEW,
  ACCESS_REQUEST_STATUSES.EXISTING_MATCH,
] as const;

const MATCHED_TYPES = [
  ACCESS_REQUEST_MATCH_TYPES.PHIX_EXACT,
  ACCESS_REQUEST_MATCH_TYPES.SAFESCRIBE_EXACT,
  ACCESS_REQUEST_MATCH_TYPES.POSSIBLE,
] as const;

export function accessRequestTabWhere(
  tab?: AccessRequestTab | string,
): Prisma.SafescribeAccessRequestWhereInput {
  switch (tab) {
    case ACCESS_REQUEST_TABS.PENDING:
      return { status: { in: [...OPEN_ACCESS_REQUEST_STATUSES] } };
    case ACCESS_REQUEST_TABS.NEW:
      return {
        matchType: ACCESS_REQUEST_MATCH_TYPES.NONE,
        status: { in: [...OPEN_ACCESS_REQUEST_STATUSES] },
      };
    case ACCESS_REQUEST_TABS.EXISTING:
      return {
        matchType: { in: [...MATCHED_TYPES] },
        status: { in: [...OPEN_ACCESS_REQUEST_STATUSES] },
      };
    case ACCESS_REQUEST_TABS.ACTIVATED:
      return { status: ACCESS_REQUEST_STATUSES.APPROVED };
    case ACCESS_REQUEST_TABS.REJECTED:
      return { status: ACCESS_REQUEST_STATUSES.REJECTED };
    default:
      return {};
  }
}

export function buildAccessRequestWhere(query: {
  tab?: string;
  status?: string;
  search?: string;
  matchType?: string;
  source?: string;
  province?: string;
}): Prisma.SafescribeAccessRequestWhereInput {
  const AND: Prisma.SafescribeAccessRequestWhereInput[] = [];
  const tabWhere = accessRequestTabWhere(query.tab);
  if (Object.keys(tabWhere).length) AND.push(tabWhere);
  if (query.status) AND.push({ status: query.status });
  if (query.matchType) AND.push({ matchType: query.matchType });
  if (query.province?.trim()) AND.push({ province: query.province.trim() });

  const source = query.source?.trim();
  if (source === 'qr') {
    AND.push({
      OR: [
        { utmMedium: { equals: 'qr', mode: 'insensitive' } },
        { utmSource: { equals: 'fax', mode: 'insensitive' } },
      ],
    });
  } else if (source === 'web') {
    AND.push({
      NOT: {
        OR: [
          { utmMedium: { equals: 'qr', mode: 'insensitive' } },
          { utmSource: { equals: 'fax', mode: 'insensitive' } },
        ],
      },
    });
  } else if (source) {
    AND.push({ source });
  }

  const search = query.search?.trim();
  if (search) {
    const or: Prisma.SafescribeAccessRequestWhereInput[] = [
      { pharmacyName: { contains: search, mode: 'insensitive' } },
      { licenceNumber: { contains: search, mode: 'insensitive' } },
      { contactName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { capturedPublicIp: { contains: search, mode: 'insensitive' } },
    ];
    const requestNumber = parseAccessRequestId(search);
    if (requestNumber) or.push({ requestNumber });
    const numeric = Number(search);
    if (Number.isInteger(numeric) && numeric > 0 && numeric < 1_000_000_000) {
      or.push({ requestNumber: numeric });
    }
    AND.push({ OR: or });
  }

  if (!AND.length) return {};
  return AND.length === 1 ? AND[0]! : { AND };
}

export function toCsvRow(values: Array<string | number | null | undefined>): string {
  return values
    .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
    .join(',');
}
