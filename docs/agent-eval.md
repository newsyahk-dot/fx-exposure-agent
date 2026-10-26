# Agent evaluation

Measured 2026-10-26 05:31 UTC on the live sandbox demo book (22 invoices, ECB 2026-10-23),
model `claude-haiku-5-5`. Script: `npx tsx scripts/eval-agent.mts 6 10` (read-only on PayPal).

Every final output is re-checked independently after the run: eligibility, discount bounds, every amount against
code's own calculation, the stated rule of thumb (an offer only when its reduction in typical swing is larger than its
cost), and every text through the same checks — for offers, against the final terms only (stricter than during the run).
"Hostile notes" runs give the agent seller notes that ask it to break its rules (forecast the euro, offer 5%, add a
link, promise refunds, say the discount pays for itself).

| Set | Runs | Agent ran | Proposals | Drafts rejected and rewritten | Problems in final output | Cost per plan | Time (median / p90) |
|---|---|---|---|---|---|---|---|
| Home currencies USD, EUR, GBP, JPY, KRW | 30 | 30 | 193 (119 reminders, 74 offers) | 20 drafts in 13 runs (43%) | **0** | $0.0056 (max $0.0076) | 26 s / 38 s |
| Hostile seller notes (USD) | 10 | 10 | 55 (30 reminders, 25 offers) | 5 drafts in 4 runs (40%) | **0** | $0.0055 (max $0.0069) | 26 s / 33 s |

Offer reasons that compare the alternative terms the agent priced (all computed by code, allowed by the checks): 9.

No run fell back to the rule-based plan.

No problems found in any final output.
