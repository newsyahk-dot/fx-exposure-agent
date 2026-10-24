// Number formatting for the screen. English UI; the home currency is whatever the seller picks.

const MINOR_UNITS: Record<string, number> = { JPY: 0, KRW: 0 };
const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥", KRW: "₩" };

export const symbolOf = (ccy: string) => SYMBOL[ccy] ?? `${ccy} `;

export function money(currency: string, amount: number): string {
  const d = MINOR_UNITS[currency] ?? 2;
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}

// ₩52.3M, $870K, €9,800 — compact, for tiles and cards.
export function compact(ccy: string, n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const s = symbolOf(ccy);
  if (a >= 1e9) return `${sign}${s}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}${s}${(a / 1e6).toFixed(a >= 1e8 ? 0 : a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e4) return `${sign}${s}${Math.round(a / 1e3).toLocaleString("en-US")}K`;
  return `${sign}${s}${Math.round(a).toLocaleString("en-US")}`;
}

// The value compact() displays, as a number — so a difference of two shown figures adds up on screen.
export function roundAsShown(n: number): number {
  const a = Math.abs(n);
  const step = a >= 1e9 ? 1e7 : a >= 1e8 ? 1e6 : a >= 1e7 ? 1e5 : a >= 1e6 ? 1e4 : a >= 1e4 ? 1e3 : 1;
  return Math.round(n / step) * step;
}

export function full(ccy: string, n: number): string {
  return `${symbolOf(ccy)}${Math.round(n).toLocaleString("en-US")}`;
}

// Amounts in table cells: no currency code, grouped digits, blank for zero.
export function cell(currency: string, amount: number): string {
  if (!amount) return "";
  const d = MINOR_UNITS[currency] ?? 0;
  return amount.toLocaleString("en-US", { maximumFractionDigits: d });
}
