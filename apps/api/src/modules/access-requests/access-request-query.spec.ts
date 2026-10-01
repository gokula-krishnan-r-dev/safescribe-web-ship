import { ACCESS_REQUEST_MATCH_TYPES, ACCESS_REQUEST_STATUSES, ACCESS_REQUEST_TABS } from '@safescript/shared';
import { accessRequestTabWhere, buildAccessRequestWhere } from './access-request-query';

describe('access-request-query', () => {
  it('scopes new pharmacies to unmatched open requests', () => {
    expect(accessRequestTabWhere(ACCESS_REQUEST_TABS.NEW)).toEqual({
      matchType: ACCESS_REQUEST_MATCH_TYPES.NONE,
      status: {
        in: [
          ACCESS_REQUEST_STATUSES.PENDING,
          ACCESS_REQUEST_STATUSES.NEEDS_REVIEW,
          ACCESS_REQUEST_STATUSES.EXISTING_MATCH,
        ],
      },
    });
  });

  it('scopes existing matches to open matched requests', () => {
    const where = accessRequestTabWhere(ACCESS_REQUEST_TABS.EXISTING);
    expect(where.matchType).toEqual({
      in: [
        ACCESS_REQUEST_MATCH_TYPES.PHIX_EXACT,
        ACCESS_REQUEST_MATCH_TYPES.SAFESCRIBE_EXACT,
        ACCESS_REQUEST_MATCH_TYPES.POSSIBLE,
      ],
    });
  });

  it('parses friendly request IDs in search', () => {
    const where = buildAccessRequestWhere({ search: 'REQ-000125' });
    expect(where).toEqual({
      OR: expect.arrayContaining([{ requestNumber: 125 }]),
    });
  });

  it('filters QR submissions without changing stored source', () => {
    const where = buildAccessRequestWhere({ source: 'qr' });
    expect(where).toEqual({
      OR: [
        { utmMedium: { equals: 'qr', mode: 'insensitive' } },
        { utmSource: { equals: 'fax', mode: 'insensitive' } },
      ],
    });
  });
});
