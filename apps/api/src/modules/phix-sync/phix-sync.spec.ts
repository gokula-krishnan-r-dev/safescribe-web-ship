import { PHIX_SYNC_EVENTS } from './phix-mapping';

describe('Phix sync contract', () => {
  it('covers pharmacy and user lifecycle events', () => {
    expect(PHIX_SYNC_EVENTS).toEqual(
      expect.arrayContaining([
        'pharmacy.upsert',
        'pharmacy.verified',
        'pharmacy.suspended',
        'pharmacy.deleted',
        'user.upsert',
        'user.suspended',
        'user.deleted',
        'user.password',
      ]),
    );
  });
});
