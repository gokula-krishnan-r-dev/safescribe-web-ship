import { pickBestBrand } from './ccdd.enricher';

describe('CCDD brand enrichment', () => {
  it('never selects Unknown as a trade name', () => {
    expect(pickBestBrand(['Unknown', 'METFORMIN'], 'metformin')).toBeUndefined();
    expect(pickBestBrand(['Unknown'], 'metformin')).toBeUndefined();
  });

  it('prefers a distinctive trade name over house brands', () => {
    const brand = pickBestBrand(['APO-METFORMIN', 'GLUCOPHAGE'], 'metformin');
    expect(brand?.toLowerCase()).toBe('glucophage');
  });
});
