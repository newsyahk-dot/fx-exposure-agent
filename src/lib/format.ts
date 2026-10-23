// Number formatting for the screen. English UI, KRW as the home currency.

const MINOR_UNITS: Record<string, number> = { JPY: 0, KRW: 0 };

export function money(currency: string, amount: number): string {
  const d = MINOR_UNITS[currency] ?? 2;
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}

// ₩52.3M, ₩870K, ₩9,800 — compact for tiles and cards.
export function krwCompact(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1e9) return `${sign}₩${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}₩${(a / 1e6).toFixed(a >= 1e8 ? 0 : a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e4) return `${sign}₩${Math.round(a / 1e3).toLocaleString("en-US")}K`;
  return `${sign}₩${Math.round(a).toLocaleString("en-US")}`;
}

export function krwFull(n: number): string {
  return `₩${Math.round(n).toLocaleString("en-US")}`;
}

// Amounts in table cells: no currency code, grouped digits, blank for zero.
export function cell(currency: string, amount: number): string {
  if (!amount) return "";
  const d = MINOR_UNITS[currency] ?? 0;
  return amount.toLocaleString("en-US", { maximumFractionDigits: d });
}
