import {
  canonicalIngredientKey,
  findingsApplyToProduct,
  isTopicalProductName,
  resolveBrandToIngredient,
} from './drug-name.util';
import { inferProductRoute } from './value-set-membership.util';

describe('zolmitriptan / Zomig identity', () => {
  it('normalizes ZOMIG to zolmitriptan', () => {
    expect(resolveBrandToIngredient('ZOMIG')).toBe('zolmitriptan');
    expect(canonicalIngredientKey('ZOMIG')).toBe('zolmitriptan');
  });

  it('normalizes ZOMIG RAPIMELT to zolmitriptan', () => {
    expect(resolveBrandToIngredient('ZOMIG RAPIMELT')).toBe('zolmitriptan');
    expect(canonicalIngredientKey('ZOMIG RAPIMELT 2.5 mg tablet')).toBe('zolmitriptan');
  });

  it('normalizes ZOMIG NASAL SPRAY to zolmitriptan with a systemic (non-topical) route', () => {
    expect(resolveBrandToIngredient('ZOMIG NASAL SPRAY')).toBe('zolmitriptan');
    expect(canonicalIngredientKey('ZOMIG NASAL SPRAY 5 mg')).toBe('zolmitriptan');
    expect(isTopicalProductName('ZOMIG NASAL SPRAY')).toBe(false);
    expect(isTopicalProductName('ZOMIG NASAL SPRAY 5 mg')).toBe(false);
    expect(inferProductRoute('ZOMIG NASAL SPRAY', 'nasal')).toBe('SYSTEMIC');
    expect(inferProductRoute('ZOMIG NASAL SPRAY 5 mg')).not.toBe('TOPICAL');
  });

  it('does not treat a dermatologic cream as the same route class as a nasal spray', () => {
    expect(isTopicalProductName('Acyclovir 5% cream')).toBe(true);
    expect(isTopicalProductName('Diclofenac cream')).toBe(true);
  });
});

describe('findingsApplyToProduct — ingredient identity, not formulation', () => {
  it('applies a zolmitriptan finding to oral, Rapimelt, and nasal Zomig', () => {
    expect(findingsApplyToProduct('ZOMIG', 'ZOMIG RAPIMELT')).toBe(true);
    expect(findingsApplyToProduct('ZOMIG 2.5 mg tablet', 'ZOMIG NASAL SPRAY 5 mg')).toBe(true);
    expect(
      findingsApplyToProduct('ZOMIG RAPIMELT 2.5 mg tablet', 'ZOMIG NASAL SPRAY', 'zolmitriptan'),
    ).toBe(true);
  });

  it('does not leak an Imitrex (sumatriptan) nasal finding onto Zomig nasal spray', () => {
    expect(
      findingsApplyToProduct('IMITREX NASAL SPRAY', 'ZOMIG NASAL SPRAY'),
    ).toBe(false);
    expect(
      findingsApplyToProduct('IMITREX NASAL SPRAY 5 mg', 'ZOMIG NASAL SPRAY 5 mg', 'zolmitriptan'),
    ).toBe(false);
    expect(canonicalIngredientKey('IMITREX NASAL SPRAY')).toBe('sumatriptan');
  });

  it('does not match products that only share nasal/spray wording', () => {
    expect(findingsApplyToProduct('IMITREX NASAL SPRAY', 'ZOMIG RAPIMELT')).toBe(false);
    expect(findingsApplyToProduct('IMITREX', 'ZOMIG')).toBe(false);
  });
});
