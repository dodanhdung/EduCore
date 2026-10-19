import { describe, expect, it } from 'vitest';
import {
  BillingCalculator,
  MAX_VND,
  vnd,
} from '../../src/billing/billing-calculator.js';
describe('R2 exact P0 calculator', () => {
  const c = new BillingCalculator();
  it('rounds once at invoice level with HALF_UP and no combo', () => {
    expect(c.calculate([{ units: 1, unitPriceVnd: '5' }], true).totalVnd).toBe(
      '5',
    );
    expect(
      c.calculate(
        [
          { units: 1, unitPriceVnd: '5' },
          { units: 1, unitPriceVnd: '5' },
        ],
        true,
      ).totalVnd,
    ).toBe('9');
    expect(
      c.calculate([{ units: 1, unitPriceVnd: '1000000' }], true).totalVnd,
    ).toBe('900000');
  });
  it('rejects overflow and noncanonical/floating money without caps', () => {
    expect(() =>
      c.calculate(
        [
          { units: 1, unitPriceVnd: MAX_VND.toString() },
          { units: 1, unitPriceVnd: '1' },
        ],
        false,
      ),
    ).toThrow('OVERFLOW');
    for (const s of ['1.1', '-1', '01', 'NaN', '1e3'])
      expect(() => vnd(s)).toThrow();
    expect(vnd(MAX_VND.toString())).toBe(MAX_VND);
  });
  it('keeps zero charge lines without erasing tariff evidence', () => {
    expect(c.calculate([{ units: 0, unitPriceVnd: '100000' }], false)).toEqual({
      grossVnd: '0',
      discountVnd: '0',
      totalVnd: '0',
    });
  });
});
