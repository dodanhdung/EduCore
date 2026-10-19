/** P0 exact integer arithmetic. No prepaid/combo or floating point money. */
export const MAX_VND = 9_223_372_036_854_775_807n;
export function vnd(value: string, allowZero = true): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error('INVALID_VND');
  const amount = BigInt(value);
  if (amount > MAX_VND || (!allowZero && amount === 0n))
    throw new Error('VND_OUT_OF_RANGE');
  return amount;
}
export interface ChargeInput {
  units: 0 | 1;
  unitPriceVnd: string;
}
export class BillingCalculator {
  calculate(lines: readonly ChargeInput[], sibling: boolean) {
    const gross = lines.reduce((sum, line) => {
      if (line.units !== 0 && line.units !== 1)
        throw new Error('INVALID_UNITS');
      return sum + vnd(line.unitPriceVnd) * BigInt(line.units);
    }, 0n);
    if (gross > MAX_VND) throw new Error('VND_OVERFLOW');
    const net = sibling ? (gross * 9n + 5n) / 10n : gross;
    return {
      grossVnd: gross.toString(),
      discountVnd: (gross - net).toString(),
      totalVnd: net.toString(),
    };
  }
}
