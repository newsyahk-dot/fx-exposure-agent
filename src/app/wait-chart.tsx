// Range of outcomes by wait length, from two years of ECB rates. Server-rendered SVG: one line per
// currency (colour follows the currency, never its rank), direct labels at the line ends, a hover title on
// every point, and the same numbers as a table for anyone who cannot read the chart.

import type { Band } from "@/lib/evidence";
import styles from "./page.module.css";

const SLOT: Record<string, number> = { USD: 1, EUR: 2, JPY: 3, GBP: 4, KRW: 5 };
const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}%`;

export function WaitChart({ bands, base }: { bands: Band[]; base: string }) {
  const ccys = [...new Set(bands.map((b) => b.currency))];
  const horizons = [...new Set(bands.map((b) => b.horizon))].sort((a, b) => a - b);
  const half = (b: Band) => (b.p95 - b.p5) / 2;
  const maxY = Math.max(0.01, ...bands.map(half));
  const yTop = Math.ceil(maxY * 100) / 100;
  const W = 640, H = 260, L = 44, R = 56, T = 16, B = 34;
  const x = (h: number) => L + ((h - 0) / (horizons.at(-1)! - 0)) * (W - L - R);
  const y = (v: number) => T + (1 - v / yTop) * (H - T - B);
  const ticks = [0, yTop / 2, yTop];
  // Line-end labels: currencies that end close together (JPY and GBP at 90 days) would overprint, so spread them
  // at least GAP apart, keeping their order; each label still sits next to its own line's colour.
  const labelY = spreadLabels(
    ccys.map((c) => {
      const pts = bands.filter((b) => b.currency === c).sort((a, b) => a.horizon - b.horizon);
      return { c, y: y(half(pts.at(-1)!)) + 4 };
    }),
    14,
    T + 8,
    H - B,
  );
  return (
    <figure className={styles.chart}>
      <figcaption className={styles.chartLegend}>
        {ccys.map((c) => (
          <span key={c}>
            <i style={{ background: `var(--series-${SLOT[c] ?? 1})` }} aria-hidden="true" />
            {c} → {base}
          </span>
        ))}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Range of moves against ${base} by days waited, last two years`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className={styles.grid} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" className={styles.axis}>
              ±{(t * 100).toFixed(t === 0 ? 0 : 1)}%
            </text>
          </g>
        ))}
        {horizons.map((h) => (
          <text key={h} x={x(h)} y={H - 12} textAnchor="middle" className={styles.axis}>
            {h}d
          </text>
        ))}
        {ccys.map((c) => {
          const pts = bands.filter((b) => b.currency === c).sort((a, b) => a.horizon - b.horizon);
          const color = `var(--series-${SLOT[c] ?? 1})`;
          const last = pts.at(-1)!;
          return (
            <g key={c}>
              <polyline
                points={pts.map((p) => `${x(p.horizon)},${y(half(p))}`).join(" ")}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
              />
              {pts.map((p) => (
                <circle key={p.horizon} cx={x(p.horizon)} cy={y(half(p))} r={4} fill={color} stroke="var(--surface-1)" strokeWidth={2}>
                  <title>{`${c} → ${base}, waiting ${p.horizon} days: ${pct(p.p5)} to ${pct(p.p95)} nine times out of ten (${p.n} start days)`}</title>
                </circle>
              ))}
              <text x={x(last.horizon) + 8} y={labelY[c]} className={styles.lineLabel} style={{ fill: color }}>
                {c}
              </text>
            </g>
          );
        })}
      </svg>
      <details className={styles.leftAlone}>
        <summary>Table view</summary>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Days waited</th>
                {ccys.map((c) => (
                  <th key={c} scope="col" className={styles.num}>
                    {c} → {base}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {horizons.map((h) => (
                <tr key={h}>
                  <th scope="row">{h}</th>
                  {ccys.map((c) => {
                    const b = bands.find((x) => x.currency === c && x.horizon === h)!;
                    return (
                      <td key={c} className={styles.num}>
                        {pct(b.p5)} to {pct(b.p95)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

// Moves labels apart so no two are closer than `gap`, within [min, max], keeping their top-to-bottom order.
export function spreadLabels(items: { c: string; y: number }[], gap: number, min: number, max: number): Record<string, number> {
  const sorted = [...items].sort((a, b) => a.y - b.y).map((i) => ({ ...i }));
  for (let i = 0; i < sorted.length; i++) {
    sorted[i].y = Math.max(sorted[i].y, i ? sorted[i - 1].y + gap : min);
  }
  // If the stack ran past the bottom, push it back up.
  for (let i = sorted.length - 1; i >= 0; i--) {
    sorted[i].y = Math.min(sorted[i].y, i < sorted.length - 1 ? sorted[i + 1].y - gap : max);
  }
  return Object.fromEntries(sorted.map((i) => [i.c, i.y]));
}
