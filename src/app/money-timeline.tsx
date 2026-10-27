// When the money comes in, by week: grey = as invoiced (late invoices first), blue = if clients pay as the proposals
// ask. Plain SVG, no client code, so the Today page (server) and the /try page (client) both render it.

import { compact } from "@/lib/format";
import { ASSUME } from "@/lib/evidence";
import type { MoneyTimeline as Timeline } from "@/lib/money-timeline";
import styles from "./page.module.css";

export function MoneyTimeline({ t, base }: { t: Timeline; base: string }) {
  if (!(t.total > 0)) return null;
  const c = (n: number) => compact(base, n);
  const W = 640, H = 170, L = 8, R = 8, T = 14, B = 34;
  const max = Math.max(1, ...t.bins.flatMap((b) => [b.asInvoiced, b.asProposed]));
  const slot = (W - L - R) / t.bins.length;
  const bw = Math.min(26, slot / 2 - 4);
  const h = (v: number) => (v / max) * (H - T - B);
  const moved = Math.round(t.soon.asProposed - t.soon.asInvoiced);
  return (
    <figure className={styles.timeline}>
      <figcaption>
        <strong>When the money comes in</strong>
        {moved > 0 ? (
          <span>
            {" "}
            — within {t.soon.days / 7} weeks:{" "}
            {t.soon.asInvoiced > 0 ? (
              <>
                <strong>{c(t.soon.asInvoiced)}</strong> as invoiced
              </>
            ) : (
              <>nothing due as invoiced</>
            )}{" "}
            → <strong className={styles.timelineUp}>{c(t.soon.asProposed)}</strong> if clients pay as proposed
          </span>
        ) : null}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Money from clients abroad by week it is due, as invoiced and as proposed">
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} className={styles.grid} />
        {t.bins.map((b, i) => {
          const x = L + i * slot + slot / 2;
          return (
            <g key={b.key}>
              {b.asInvoiced > 0 && (
                <rect x={x - bw - 1} y={H - B - h(b.asInvoiced)} width={bw} height={h(b.asInvoiced)} rx={3} className={styles.barInvoiced}>
                  <title>{`${b.label}, as invoiced: ${c(b.asInvoiced)}`}</title>
                </rect>
              )}
              {b.asProposed > 0 && (
                <rect x={x + 1} y={H - B - h(b.asProposed)} width={bw} height={h(b.asProposed)} rx={3} className={styles.barProposed}>
                  <title>{`${b.label}, if clients pay as proposed: ${c(b.asProposed)}`}</title>
                </rect>
              )}
              <text x={x} y={H - B + 16} textAnchor="middle" className={styles.axis} data-late={b.key === "late" || undefined}>
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className={styles.timelineLegend}>
        <span>
          <i className={styles.barInvoiced} aria-hidden="true" /> As invoiced
        </span>
        <span>
          <i className={styles.barProposed} aria-hidden="true" /> If clients pay as proposed
        </span>
        <span className={styles.muted}>
          Assumes a reminded invoice is paid within {ASSUME.afterReminderDays} days and an offer by its new due date (net of the
          discount) — a scenario, not a promise.
        </span>
      </p>
    </figure>
  );
}
