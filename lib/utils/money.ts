// lib/utils/money.ts — Currency formatting

export function formatMoney(
  amount: number,
  currency = 'NZD',
  showSign = false
): string {
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);

  if (showSign) {
    return amount >= 0 ? `+${formatted}` : `-${formatted}`;
  }
  return amount < 0 ? `-${formatted}` : formatted;
}

export function formatMoneyCompact(amount: number): string {
  const abs = Math.abs(amount);
  const prefix = amount < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${prefix}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${prefix}$${(abs / 1_000).toFixed(1)}k`;
  return `${prefix}$${abs.toFixed(2)}`;
}

export function isPositive(amount: number): boolean {
  return amount >= 0;
}

export function amountClass(amount: number): string {
  return amount >= 0 ? 'amount-positive' : 'amount-negative';
}
