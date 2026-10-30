// When the money comes in, by week: grey = as invoiced (late invoices first), blue = if clients pay as the proposals
// ask. The caption and the scenario note are rendered here; the chart itself is AG Charts (src/app/timeline-chart.tsx).

import { compact } from "@/lib/format";
import { ASSUME } from "@/lib/evidence";
import type { MoneyTimeline as Timeline } from "@/lib/money-timeline";
import styles from "./page.module.css";
import { TimelineChart } from "./lazy";

// `paid`: money already collected today (home currency) — it has left the chart, so the caption says so.
export function MoneyTimeline({ t, base, paid = 0 }: { t: Timeline; base: string; paid?: number }) {
  if (!(t.total > 0)) return null;
  const c = (n: number) => compact(base, n);
  const moved = Math.round(t.soon.asProposed - t.soon.asInvoiced);
  return (
    <figure className={styles.timeline}>
      <figcaption>
        <strong>When the money comes in</strong>
        {paid > 0 && (
          <span>
            {" "}
            — <strong className={styles.timelineUp}>{c(paid)}</strong> already paid today
          </span>
        )}
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
      <TimelineChart bins={t.bins} base={base} />
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
