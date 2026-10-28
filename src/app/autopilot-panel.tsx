"use client";

import { useActionState } from "react";
import { DISCOUNT_PCTS } from "@/lib/agent";
import type { Policy } from "@/lib/policy";
import { runAutopilotNow, savePolicy, type PolicyState, type RunState } from "./autopilot-actions";
import styles from "./page.module.css";

const NOTES_PLACEHOLDER = "e.g. Kleinfeld GmbH pays on the 5th of each month; don't chase them before then. Keep e-mails short.";

export function AutopilotPanel({ policy, base, readOnly }: { policy: Policy; base: string; readOnly: boolean }) {
  const [saved, save, saving] = useActionState<PolicyState, FormData>(savePolicy, null);
  const [run, runNow, running] = useActionState<RunState, FormData>(runAutopilotNow, null);
  const on = policy.enabled && !!policy.approvedAt;
  return (
    <div className={styles.autopilot}>
      <div className={styles.agentStatus}>
        <p>
        {on ? (
          <>
            <strong>Autopilot is on</strong> · approved {policy.approvedAt!.slice(0, 16).replace("T", " ")} UTC · plans in {policy.base} ·{" "}
            {[policy.reminders && "reminders", policy.discounts && `discounts up to ${policy.maxDiscountPct}%`].filter(Boolean).join(" and ") ||
              "no actions allowed"}{" "}
            · at most {policy.maxActionsPerRun} per run
          </>
        ) : (
          <>
            <strong>Autopilot is off.</strong> Every proposal waits for your click.
          </>
        )}
        </p>
      </div>

      <form action={save} className={styles.assistantForm}>
        <input type="hidden" name="base" value={base} />
        <fieldset className={styles.policyBox} disabled={readOnly || saving}>
          <legend>What the agent may do without asking</legend>
          <label className={styles.check}>
            <input type="checkbox" name="reminders" defaultChecked={policy.reminders} /> Send payment reminders on overdue invoices
          </label>
          <label className={styles.check}>
            <input type="checkbox" name="discounts" defaultChecked={policy.discounts} /> Apply early-payment discounts up to{" "}
            <select name="maxDiscountPct" defaultValue={policy.maxDiscountPct}>
              {DISCOUNT_PCTS.map((p) => (
                <option key={p} value={p}>
                  {p}%
                </option>
              ))}
            </select>
          </label>
          <label className={styles.check}>
            At most{" "}
            <input type="number" name="maxActionsPerRun" min={1} max={5} defaultValue={policy.maxActionsPerRun} className={styles.smallNum} /> actions
            per run, planning in {base}
          </label>
        </fieldset>
        <label className={styles.field}>
          Notes for the agent (used by the plan above too — preferences, never rules or numbers)
          <textarea name="notes" rows={2} maxLength={600} defaultValue={policy.notes} placeholder={NOTES_PLACEHOLDER} disabled={readOnly || saving} />
        </label>
        <div className={styles.approveRow}>
          <button type="submit" name="intent" value="approve" className={styles.approve} disabled={readOnly || saving}>
            {on ? "Approve the updated policy" : "Approve this standing policy"}
          </button>
          <button type="submit" name="intent" value="notes" className={styles.secondaryButton} disabled={readOnly || saving}>
            Save notes only
          </button>
          {on && (
            <button type="submit" name="intent" value="off" className={styles.secondaryButton} disabled={readOnly || saving}>
              Turn autopilot off
            </button>
          )}
          {readOnly && <span className={styles.muted}>Read-only</span>}
          {saved && (
            <span role="status" className={saved.ok ? styles.ok : styles.error}>
              {saved.message}
            </span>
          )}
        </div>
      </form>

      <form action={runNow} className={styles.approveRow}>
        <button type="submit" className={styles.secondaryButton} disabled={readOnly || !on || running}>
          {running ? "Autopilot running…" : "Run autopilot now"}
        </button>
        <span className={styles.muted}>Also runs on its own on weekday mornings (00:17 UTC).</span>
      </form>
      {run && <RunResult r={run} />}
    </div>
  );
}

function RunResult({ r }: { r: NonNullable<RunState> }) {
  if (!r.ran)
    return (
      <p role="status" className={styles.muted}>
        Did not run: {r.reason}.
      </p>
    );
  return (
    <div role="status" className={styles.runResult}>
      <p>
        <strong>
          Autopilot ran ({r.agent === "agent" ? "Claude's plan" : "rule-based plan"}): {r.executed.filter((x) => x.ok).length} done
        </strong>
        {r.executed.some((x) => !x.ok) && `, ${r.executed.filter((x) => !x.ok).length} refused`}.
      </p>
      <ul>
        {r.executed.map((x, i) => (
          <li key={i} className={x.ok ? undefined : styles.error}>
            {x.message}
          </li>
        ))}
        {r.left.map((x, i) => (
          <li key={`l${i}`} className={styles.muted}>
            {x.invoiceNumber}: {/^(already|no longer)/.test(x.why) ? "skipped" : "left for your click"} — {x.why}
          </li>
        ))}
      </ul>
    </div>
  );
}
