@AGENTS.md

# fx-exposure-agent — project rules

Entry for the **PayPal AI Hackathon** (Devpost). Submission deadline: Nov 12, 2026 12:00 PT (Nov 13 05:00 KST).
Plan (Korean): newsyahk-dot/fx-wiki `docs/contests/2026-10-20-PayPal-AI-해커톤-기획.md`.

## What it is
For solo sellers and freelancers paid in several currencies through PayPal invoices: show how much of the
money still owed is exposed to FX moves, by currency and by week, and let an AI agent carry out PayPal
actions that shorten that exposure (payment reminders, early-payment discount terms) **after the user approves**.

## Rules
- **Sandbox only.** Never call PayPal live endpoints, never move real money.
- **No secrets in the repo.** This repo is public. Keys live in `.env.local` (git-ignored) or Vercel env vars.
  Names: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `FXA_ANTHROPIC_API_KEY` (app-only key; not `ANTHROPIC_API_KEY`,
  which collides with Claude Code's own login). Never print their values. The Anthropic client pins
  `baseURL` to api.anthropic.com so an environment `ANTHROPIC_BASE_URL` can never redirect the key.
- **No FX direction calls.** Shocks are symmetric (±3%). The 1-sigma swing is a size of uncertainty, not an
  expected loss. The app shows costs and swings side by side and never says which choice is better.
- **Nothing silently dropped.** Invoices that cannot be valued go to `skipped` with a reason.
- **Rates source:** ECB euro reference rates via Frankfurter, EUR base crossed into the home currency (`src/lib/fx.ts`).
  Do not query `base=KRW` — it returns rounded quotes (0.7% error, measured 2026-10-23). Show the source on screen.
- **Every agent action needs an explicit approve click** — either on that proposal, or on a standing policy that covers
  it (`src/lib/policy.ts`, stored in a PayPal invoice template). The autopilot (`src/lib/autopilot.ts`, button or Vercel
  cron with `CRON_SECRET`) runs only proposals inside the approved policy, through the same checks and the same
  `executeAction` path, and logs them with an `auto` mark. Only "approve" can change the bounds. Seller notes are
  preferences passed to the agent as data; they cannot change rules, eligibility or numbers.
- **The agent is checked by code** (`src/lib/agent.ts`, `src/lib/checks.ts`): code decides eligibility and every
  number; every text the model writes must use only numbers from the facts, keep each figure under its own label
  (3% stress test vs 1σ typical swing), avoid forecasts/advice/"benefit"/"pays for itself", and (client text) links
  and conditional promises. Rejections go back to the model to rewrite. The approve action re-checks on the server.
  Model: `FXA_AGENT_MODEL` (default claude-haiku-5-5, effort medium). **One plan per day** per home currency, ECB
  fixing and seller notes (`src/lib/agent-cache.ts`); each proposal is reconciled with its invoice at render time
  (`src/lib/plan-state.ts`: open / sent / paid / changed), so approvals and payments never wait for a new plan.
  "Re-plan" (access code) expires only that currency's tag (`planTag(base)`; it used to expire every currency, and the
  next visitor of each waited ~60 s — measured 2026-10-28). Every page visit warms the other currencies' plans in
  `after()` (`warmOtherPlans`, one run per missing plan per instance). The demo snapshot stores one run per home currency. No key or an
  error → rule-based fallback.
- **PayPal MCP (read-only)**: `runAgent` connects PayPal's sandbox MCP server (`PAYPAL_MCP_URL`, beta `mcp-client-2025-11-20`,
  the PayPal OAuth token as `authorization_token`) with an allowlist of `get_invoice` / `search_invoicing`
  (`PAYPAL_MCP_TOOLS`) — never write tools. If it fails the run is retried without it. Off for interactive requests
  (`readPayPal: false`) because it roughly doubles the run time. `FXA_PAYPAL_MCP=0` turns it off.
- **Ask the agent** (Today, `?ask=`, `src/app/ask-agent.tsx`, `askFor` in `src/lib/agent-cache.ts`): the seller's sentence goes to
  the same agent as a `<seller_request>` (data, like notes — it cannot change rules, eligibility or numbers); the answer
  and cards render like the plan and use the same approve path. Needs the access code; cached per request for hours.
  The final summary goes through the checked `submit_summary` tool, so a refusal is rewritten instead of withheld.
- **Agent reacts to PayPal events**: a verified `INVOICING.INVOICE.SENT` webhook for a non-seed invoice runs
  `reactToNewInvoices` (`src/lib/autopilot.ts`) in `after()`: the agent looks at open invoices the day's plan has not
  seen (`newInvoicesRequest`, cached per set of invoices), and proposals inside the approved policy run through the same
  path as the autopilot. The autopilot never changes the terms of an invoice sent in the last `NEW_TERMS_DAYS` (7) days
  (`outsidePolicy` in `src/lib/policy.ts`; 2026-10-27, after a blind review read it as overriding terms she just chose);
  such an offer waits for her click. Seed offer invoices are dated 8+ days back so the demo autopilot has work. Today shows the answer under "New since today's plan". Sandbox sends CREATED/SENT for
  API-created invoices (measured 2026-10-26). Seed invoices are skipped so a reset does not start 24 runs.
- **Home currency** is chosen on screen (`?base=`), default `FXA_DEFAULT_BASE` or USD. Raw ECB quotes are stored, so any
  of USD/EUR/GBP/JPY/KRW works in live and demo mode.
- **What the agent puts in front of the seller** (2026-10-27): the story is getting paid sooner; FX is why sooner matters
  more for foreign money. An early-payment discount is a price for getting paid sooner, **not an FX hedge** (a certain
  cost vs a move that can go either way — a blind review called the old "swing reduction > cost" rule shaky). Code
  enforces the app's rule for offers (`OFFER_MIN_DAYS_SOONER` 21 days, `OFFER_MAX_ANNUAL_PCT` 12% as a yearly rate by the
  trade-credit formula percent / (100 − percent) × 365 / days sooner) in `priceDiscount` and the propose tool; cards show
  cost, days sooner and the yearly rate; the swing stays as information. The default autopilot policy is reminders only.
  No offer goes to a client who already owes a late invoice (code rule in `buildAgentInput`, round 7, 2026-11-09 — a
  discount would reward a late payer; FXA-3005 moved to Mori Design Office so the JPY demo keeps an offer).
  Change the rule in code, prompt, eval and this line together.
- **Conditional offer = a second invoice** (2026-10-28, `src/lib/offer-invoice.ts`, `offer-settle.ts`): PayPal's
  conditional-rules endpoint still answers HTTP 500 (re-tested 2026-10-28), and editing the sent invoice made the discount
  unconditional (a blind review called it the agent undercutting the seller). Now approving an offer sends a separate
  invoice `<original>-EP` (memo `fxa-offer: <originalId> <pct>`) for the discounted amount, due on the earlier date; the
  original never changes (only its memo logs the action). The book (`attachOffers`) hides offer invoices and attaches
  them to their original: paid → original shown as paid with the offer's payment; past its date → lapsed, original
  applies. PayPal-side: the `INVOICING.INVOICE.PAID` webhook for an offer records the original as paid
  (`settleOriginal`); the autopilot cron settles/cancels (`reconcileOffers`); "Simulate client payment" pays an open
  offer instead of the original; the demo reset closes offers too. Verified in the sandbox with
  `scripts/check-actions.mts` (EUR and JPY: offer SENT, original unchanged, paying the offer → original MARKED_AS_PAID).
- **New invoices** (`src/lib/invoice-plan.ts`): Claude only reads the seller's sentence into fields and writes the
  comparison (same checks, never says which option to pick). Code computes every option from the client's payment
  history and ECB rates; the create action re-validates and recomputes before calling PayPal. No KRW invoices (PayPal).
- **Evidence** (`src/lib/evidence.ts`) is history over two years of ECB fixings, always labelled "not a forecast",
  with the payment-timing assumptions shown on screen.
- **Hosted demo access**: with `FXA_ACCESS_CODE` set, every write action and every on-demand model call needs the code
  (httpOnly cookie holding a hash, `src/lib/access.ts`); every server action checks it. Without the code the planner
  uses rules only. The agent plan is one per day, so visitors cannot multiply model calls.
- **API cost** (measured 2026-10-24, Haiku 5.5 $0.10/$0.50 per MTok): one agent plan ≈ $0.007–0.01 with prompt caching and PayPal MCP reads, ~50–60 s (eval 2026-10-27, `docs/agent-eval.md`; $0.0056 / 26 s without the reads); an "Ask the agent" request ≈ $0.004
  (≈ $0.005–0.012 without). Model calls happen only (1) for the daily agent plan per home currency (new day, new ECB fixing,
  changed notes, or Re-plan; warmed by cron) — shared cache (`"use cache: remote"`), so visits and the autopilot reuse it; (2) for the invoice planner
  with the access code — the comparison is cached per request; (3) never from visitors without the code beyond (1). Each run logs `[agent-usage]` with tokens and cost to the host logs (`src/lib/usage.ts`; update
  `PRICES` with the model). The hard ceiling is the Anthropic Console monthly spend limit, not code.
- **The loop and the demo**: Today screen = at risk now → proposals → approve → sent → pay as client → paid, with
  "start of today → now". PayPal webhooks (`/api/paypal/webhook`, verified with PayPal; register with
  `scripts/register-webhook.mts`) expire the cached book; the Today screen refreshes every 10 s. A payment recorded
  through the API raised no webhook in the sandbox (2026-10-26); one made on PayPal's invoice page does — verified
  2026-10-26 with the sandbox buyer login: the Today screen showed "Paid" in under 20 s. The demo book (US-based
  freelancer, clients in EUR/GBP/JPY + USD) resets nightly (`/api/warm?reset=1`) and from the "Reset the demo book"
  button; the reset turns the autopilot off.
- **Writing for judges**: README, Devpost and the video start with the seller and what she gets; how it works and
  reliability numbers come after. No "engine/platform" words up front.
- **Navigation speed** (2026-10-26): every step and currency is a server render, so each click shows feedback at once
  (`nav-link.tsx`: clicked pill pulses, top bar, page dims). The book cache refreshes in the background after 60 s and
  expires only after a day idle (it used to block the first click after 10 idle minutes, 3.2 s measured). Plan-dependent
  Suspense boundaries are keyed by currency and `partialPrefetching` is off, so an unplanned currency switches at once and
  streams its plan. The demo reset plans every currency in the background (`after()`).
  **A deploy empties the shared (`use cache: remote`) cache**, so each currency's first visit after a deploy waits ~30 s
  for a new plan (measured 2026-10-26). After every deploy, warm it: `/api/warm` with `CRON_SECRET`, or open
  `/?base=<B>&step=today` for all five currencies once. Avoid deploying during judging unless needed.
  `vercel.json` `ignoreCommand` skips the build when a commit changes only `docs/` or `*.md` (exit 0 = skip), so
  documentation edits do not redeploy and empty the cache. If the previous commit is missing the build runs (safe side).
  **Nightly plans** (2026-10-29): the 00:07 reset job plans every currency in the same call and seemed to run past its
  limit (at 02:38 UTC USD and EUR still took 64 s and 53 s), so a second cron `/api/warm` at 00:37 plans without resetting.
  **Keep-warm** (2026-10-28; GitHub actually ran it every 3–5 hours, not every 30 minutes): `.github/workflows/keep-warm.yml` opens every currency's Today page every 30 minutes (public
  pages, no secrets), so a cold plan is computed before a judge arrives. Added after plans were found cold in the morning
  and the 00:07 UTC reset had not run (the book was still yesterday's generation) — check that `CRON_SECRET` is set in
  Vercel, or every cron call gets 401 and does nothing.
- **Book day** (2026-10-27): the demo book's day is the day of its last reset (`bookDay` in `src/lib/book.ts`, held up to
  36 h), and its rates are the last ECB fixing *before* that day (`ecbBefore`). So the plan key changes only when the demo
  is reset, not at 00:00 UTC or when the ECB publishes at ~15:00 UTC — Vercel Cron only promises "within the hour", and
  visits in between used to wait about a minute for a new plan (measured 2026-10-27, 15–66 s). The plan key includes the
  demo generation (`startedAt`); the nightly `/api/warm?reset=1` plans every currency for the new book before expiring
  the cached book. A real seller's book (no demo start) uses today.
- **Demo video recording** (`docs/video/`, 2026-10-27): Playwright records `docs/video-script.md` on the hosted demo with captions
  and a cursor drawn into the page; `edit.py` cuts waits marked by a corner square in the video (the recording drifts
  ~7 s against the clock over 5 min, so cut times are never taken from the clock). The access code comes from
  `FXA_ACCESS_CODE` only; the unlocked session (`state.json`) and outputs are git-ignored. Reset the demo book after.
- **Try it with your own invoices** (`/try`, 2026-10-27): `src/lib/own-invoices.ts` reads a pasted CSV/TSV by header
  names (rows it cannot read are listed with a reason), `src/lib/own-analysis.ts` runs the same `viewFor` + `rulesRun` as
  the demo as of today (`quotesFor`, every ECB currency), and `try-actions.ts` adds Claude's plan only with the access
  code (`readPayPal: false`). Nothing is stored or logged; nothing in PayPal is touched. The offer rule's constants live
  in `src/lib/offer-rule.ts` (no imports, safe for client components).
- **Invoice grid** (`src/app/invoice-grid.tsx`, AG Grid Community, 2026-10-28): quick views (external filter), offer
  column, cell flash, paid-today rows kept and greyed, client payment history under the name, and row selection on rows
  with an open proposal → "Approve selected" → a confirmation listing each action → each runs through the same `approve`
  server action as the card (access code, re-checks). ▸ opens a full-width detail row (client's paid invoices + the
  agent's draft + approve one); grid callbacks are module-level or memoized because a changing `doesExternalFilterPass`
  or full-width renderer made the grid re-filter and re-render in a loop once a row was open (measured 2026-10-28).
  Draft column: the seller edits the agent's e-mail (`agLargeTextCellEditor`) or discount (`PercentEditor`, only
  `percentsWithinRule`; `agSelectCellEditor` crashed in this build: "i is not iterable"); edits live in client state,
  `applyEdit` (src/lib/invoice-rows.ts) replaces the client note with code's own sentence for a new percent, and
  `executeAction` re-checks the text and now also enforces the offer rule on the server. Detail rows are measured
  (ResizeObserver) instead of estimated; the risk column uses `initialSort` (a column rebuild brought `sort` back);
  paid-today rows sort last and show the amount paid; on phones nothing is pinned and Client / home value are hidden.
  `body { overflow-x: clip }`, not `hidden`: hidden made body a scroll container and broke the sticky approve bar.
  Late home-currency invoices are now candidates for reminders
  (offers stay for money from abroad); the timeline and Evidence still count money from abroad only.
- **Money-in timeline** (2026-10-27, `src/lib/money-timeline.ts` + `src/app/money-timeline.tsx`, Today and /try): money
  from clients abroad by the week it is due, as invoiced vs if clients pay as proposed (reminder → paid within
  `ASSUME.afterReminderDays`, offer → by its new due date net of the discount). Always labelled a scenario; late
  invoices count as not yet in. The chart is AG Charts Community 14.2 (`src/app/timeline-chart.tsx`, pinned to match
  AG Grid 36.2's chart types; colours read from the page's CSS variables; canvas fills cannot take `color-mix()`, so
  the grey bar uses `fillOpacity`). The exposure table on "Where it sits" is an AG Grid (`src/app/exposure-grid.tsx`);
  a cell click dispatches `FOCUS_EVENT` (`src/app/grid-theme.ts`) and the invoice grid narrows to that currency and
  bucket (`InvoiceRow.bucket` = `bucketOf`). AG Grid's auto-height layout forces a 150 px body; `.ag-grid-scrolling-rows`
  needs `min-height: 0 !important` or few rows leave an empty band.
- **Reminders read like the seller wrote them** (2026-10-29): the book reads each open invoice's line items once
  (`src/lib/invoice-items.ts`, cached for good — PayPal's list leaves items out), and each candidate's facts carry
  "Billed work: …", how the client paid before (`paysFact`, for tone only — never told to the client) and "The seller
  signs as Maya" (`FXA_SELLER_NAME`, default Maya for the demo book). The prompt asks for the billed work by name, a
  tone set by the client's history, varied wording, and the seller's signature; the rules fallback does the same.
- **Page load weight and cold plans** (2026-10-30): AG Grid and AG Charts (~420 KB compressed each) load through
  `src/app/lazy.tsx` (`next/dynamic`, `ssr: false`), so a page downloads only what it shows (/try 3.3 MB → 0.5 MB of
  JS). Pages call `planSoon` (`src/lib/agent-cache.ts`): if Claude's plan is not ready in `PLAN_WAIT_MS` (8 s), the page
  shows the rule-based plan marked `pending` and the plan finishes in `after()`; refreshes swap it in (a cold EUR plan
  held the Today screen 58.6 s on 2026-10-30). `planFor` shares one in-flight run per key per instance.
- **Story: receivables from abroad, seen like a treasury desk** (2026-11-09, user decision after noticing the story had
  drifted to "a late-payment reminder app" across review rounds — the generic part, not the different one). The
  one-liner: "Money owed by clients abroad, seen the way a treasury desk sees it: when it comes in, in which currency,
  what is late and what exchange rates can move. An AI agent takes the PayPal steps that shorten the wait — after you
  approve." Three moments — before she sends an invoice (Next invoice), while she waits (exposure, timeline, offers),
  when a client is late (reminders) — in README, Devpost and the video. Today: the big number, then four tiles (Late ·
  Due in 2 weeks · If rates move 3% · Collected today). Lessons kept from two lost contests: the screen leads to an
  action, the story opens on "Monday morning" with the seed book's late clients, the first tile is money that is late.
  Blind reviewers reward the familiar story; do not drop the treasury view to please them. Do not quote win
  probabilities from our own reviews; use submissions and prize counts.
- **Design for scanning** (2026-10-30): Today leads with four tiles (late, due in 2 weeks, ±3% stress test, collected today) under the
  big number, then the plan status, then the cards, then the money-in chart in its own panel (it used to sit above the
  cards). Cards carry a coloured left edge and icon by kind (amber reminder, blue offer; `src/app/icons.tsx`). Keep
  explanatory sentences short; long ones go in tooltips or details.
- **Round 10 blind review fixes** (2026-11-09): "Collected today" counts payments dated on or after the book day
  (`paidToday` in `src/lib/today.ts`, `>=` like the grid) — with `===` a payment after 00:00 UTC but before the next
  demo reset showed $0. The replayed-range line ("x% narrower") lives on Evidence only. Heatmap cells show the home
  currency (invoice currency in the tooltip) and take Enter; the overlay horizontal scrollbar is transparent so it no
  longer cuts the last row on phones. Invoice grid: no ✎ when only one percent is allowed, phones hide Still owed (it is
  in the detail row) to keep At risk on screen, the total row says how many invoices are in the home currency.
- **Round 11–12 blind review fixes** (2026-11-09): Today's cards: late money first (reminders by home-currency value,
  any currency), then offers on money still on its way; each open card says "±$X at risk from exchange rates · of
  today's ±$Y" (a rank number read "#3, #1, #2" once late cards came first, so round 13 dropped it). (Round 11 ordered everything by FX risk; round 12's reviewer showed it put a $4,200 invoice 13 days late after
  offers due in weeks — a treasury desk works late receivables first.) The Late tile counts every late invoice,
  home currency included, with the share from abroad underneath. "Ask the agent": a declined request
  proposes nothing. The rejection reason "gained or saved" is mapped before the label test. "Sent through PayPal" lists
  every action (also on invoices paid since) with "you approved" / "autopilot". The timeline's proposed bars are labelled
  a best case. Grid: Still owed sorts by home-currency value, the total row reads "N open · M in USD", the discount editor
  opens under the cell, the e-mail editor keeps its first line in view. /try cards show the client. Round 12: columns
  fit 1366 px (no sideways scroll); the transparent overlay-scrollbar CSS applies to phones only; the quick filter
  searches what cells show (`getQuickFilterText` on Client, Still owed, Due); Tab in the Draft editor keeps the edit
  instead of opening the next row's editor; the Paid-today view's total reads "N paid today". Round 13–14: "In USD" is
  hidden on screen (CSV only) — the page is never wider than 1080 px, so a ≥1440 px breakpoint made it overflow; the
  Offer cell no longer adds "· paid"; Enter or Space on an invoice cell opens its detail row; At risk uses compact
  amounts for KRW/JPY; the e-mail editor puts the cursor before "Best regards"; heatmap cells and totals use full
  amounts, right-aligned, blank instead of "$0".
- **Front door** (2026-11-09, user's choice of the spacious draft over a compact one): the top of every page is a
  landing band — brand bar ("PayPal sandbox · no real money"), a two-line headline "Money from clients abroad, / seen
  like a treasury desk." (h1, second line in the accent colour), one sentence, a primary button "See today's plan ↓"
  (`/?step=today#actions-h`) and "Try your own invoices →", then the three moments as cards linking to Next invoice,
  Where it sits and Today. No separate landing page: it would add a click between a judge and the demo. On a 1440×900
  screen the tiles start just below the fold. The big part (`.heroExtra`) shows on Today only; the other steps keep the
  brand bar (CSS `:has([data-step])` on the step body).
- **Automatic demo reset** (2026-11-09, `src/lib/auto-reset.ts`, `/api/auto-reset`): the shared book loses its story
  once visitors pay every late invoice from abroad (round 5 reviewers saw only domestic reminders and called the FX view
  decoration). A page visit whose book has no late invoice from abroad, has been quiet for `AUTO_RESET_IDLE_MIN` (30)
  minutes (PayPal `last_update_time` and agent log) and is at least `AUTO_RESET_MIN_AGE_MIN` (60) minutes old asks
  `/api/auto-reset`, which re-checks on fresh data, answers 202 and resets in `after()` like the nightly job (reset,
  plan every currency, then expire the book). Never resets a real seller's book or someone mid-demo.
- **Round 15 fixes** (2026-11-09): every card shows its exchange-rate risk from its own value (Ask-the-agent cards had
  no rank data and called EUR/JPY invoices "No exchange-rate risk"); offer cards say "Goes out as a separate invoice"
  before approval; the other steps' summary shows the same Late figure as Today (with the share from abroad); heatmap
  copy "the stronger the blue" (dark mode reverses light/dark); the grid's confirmation list is not sticky (it covered
  the header and the rows it listed); the discount editor uses AG Grid's default popup position (kept on screen).
- **Page after a write** (2026-10-29): `loadInputsForPage` retries a failed PayPal read once and then shows the last
  good book with `StaleNotice` (refreshes every 4 s) — one failed read after "Simulate client payment" used to replace
  the whole page with an error.
- UI, README and demo video are in **English** (judges). Code comments in English.
- Run `npm test` before every push.
- **Round 7 fixes** (2026-11-09): "Ask the agent" answers "which client needs attention most" by ordering on facts (days
  late, amount owed, FX at risk) without advising; the e-mail editor puts the cursor before any common sign-off
  ("Best,", "Thanks,", "Cheers", "Kind regards, Maya"); Tab leaves the invoice grid (`tabToNextCell` → false); the
  At risk column is searchable ("±$"); Next invoice notes that PayPal's own conversion fee is not counted, linking
  PayPal's fee page (no numbers).
- **Round 8 blind review fixes** (2026-11-09): Today's cards in three groups with headings — late from abroad, on its way
  from abroad, then late in the home currency ("no exchange-rate risk") — so the first card is never a USD reminder.
  The Late tile says how many late invoices were reminded in the last 3 days (no card today). The source badge reads
  "demo day … · ECB …" with a tooltip. Auto-reset also fires (when quiet) once a late invoice from abroad has been paid
  since the reset, so the README/video story's late clients are there for the next judge. FXA-2005 is due in 80 days so
  its offer allows more than one percent (the discount editor is visible). Next invoice option "Half as a 7-day
  deposit". Docs: measured timings (approve 5–15 s; paid via PayPal's page under 20 s, simulated up to a minute),
  autopilot "once every weekday (00:17 UTC)". Laptop top tightened so the four tiles fit 1440×900. Invoice grid:
  `quickFilterParser` keeps "15 days late", "in 46 days", "GBP 3,800.00" together (AG Grid upper-cases text; Intl puts a
  no-break space after the code); Still owed shows "≈ $value" underneath (its sort key); detail rows: Enter opens and
  focuses inside, Tab/Enter on a focused detail row moves into its buttons, a native keydown listener keeps AG Grid from
  taking keys, Escape closes and refocuses the invoice cell, "Open in PayPal as the client" link inside; paid-today rows
  say "paid today" and history leaves the invoice itself out; editing the draft closes the open detail row; phones show
  Invoice · Due · At risk only, the heatmap drops its value columns. /try: every pasted line in an AG Grid
  (`src/app/own-grid.tsx`, floating filters, CSV, unread lines in red with the reason).
- **Round 9 blind review fixes** (2026-11-10): grid row selection uses `selectAll: "filtered"` and deselects rows a view
  or search hides (Late + header checkbox used to approve 7 actions, 3 off screen). The e-mail editor is our own
  `MessageEditor` (it places the cursor before the sign-off itself; AG Grid's large-text editor selected everything and
  the old rAF fix raced it); Enter makes a new line (`suppressKeyboardEvent`). Ask the agent gets `lateList` — every
  late invoice made by code, with "from abroad" or "in USD" — and must not say "only"/"all" unless the list shows it
  (it once called one invoice "the only overdue one exchange rates change" while naming another); the eval flags any
  "only … late" sentence when more than one is late. The offer's client note must say "this invoice", not the original
  number (`offerNoteNamesOriginal`, checked in the propose tool, on approve and in the eval). AG Grid modules are
  listed in `src/app/grid-modules.ts` instead of `AllCommunityModule` (a missing one logs AG Grid error #200 — e.g.
  `TextEditorModule`, which any editable column loads). Chart wrapper lost `role="img"` (keyboard navigation on);
  heatmap cells have aria-labels, a five-level legend, and wider-spaced dark-mode blues. /try: wrapped reasons, the
  sample has a line with no due date (shown in red). Draft cells read "1% · fixed" when there is nothing to pick; CSV
  "Due" exports the date and the words; search finds "≈ $", "e-mail".
- **Round 10 blind review fixes** (2026-11-10): invoice CSV leaves the pinned total row's Due blank (it exported
  "undefined (in undefined days)"); the discount editor is at least 340 px with one option per line. /try grid uses the
  shared `parseSearch` (now in `grid-theme.ts`), full home amounts, a text filter on Due ("late"), searchable unread
  reasons and a CSV with plain numbers and the reason. "What the wait already did" and the /try per-currency summary
  are AG Grids too (`src/app/table-grid.tsx`: the server passes display text plus a numeric sort/CSV field, because
  functions cannot cross from a server component; "on time" instead of a blank). Ask's ranking answers read late
  money from abroad first, then home currency, by days late within each (`lateList` sorts that way). Next invoice
  facts state the wait including the client's usual lateness, so Claude's sentence matches the note. README/Devpost
  quote the 2026-11-10 eval (rerun 04:27 UTC: 36 runs, 183 proposals, 0 problems).
- **Round 11 blind review fixes** (2026-11-10): the "checks sent back an earlier draft because …" line uses whole
  clauses (it showed "called a discount or a swing money gained"). /try Still owed sorts by home value and has no
  number filter (face values of different currencies cannot be compared). TableGrid columns take `flex`; the wait
  grid's date and invoice columns no longer clip. Ask's cards use `byCardOrder` from today.tsx (abroad late → abroad
  on its way → home late), the same as Today. Enter on a heatmap cell moves keyboard focus to the first invoice it
  narrowed to (`FocusDetail.keyboard`), the chip is a live region, and Tab leaves the heatmap like the other grids.
  Offers: `WINDOW_DAYS` 14–21 (five days was too short for a client's payables run; the rules fallback uses the
  minimum), client notes in the seller's voice ("I", never "we") and worded per client.
- **Round 12 blind review fixes** (2026-11-10): Next invoice's comparison limit is 800 characters (`COMPARISON_MAX`;
  four options with the real wait ran 610–650 and fell back to rules after three rejections). The offer-note prompt no
  longer says "payables run" (it leaked into a note as "in time for your payment run") and forbids claims about the
  client's processes the facts do not state. /try search normalises Intl's no-break space ("EUR 6,800") and searches
  agent reasons only for unread lines ("late" matched "has a late invoice"). CSV: paid-today Swing blank; the wait grid
  exports Received as a number with its own Ccy column and Days late as shown. Phones: the heatmap merges w1–w4 into
  "Next 4 weeks" (`PHONE_GROUPS`; a merged cell filters by `FocusDetail.buckets`), TableGrid columns can be
  `hideOnPhone` (the wait grid keeps Invoice · Days late · Effect), the invoice grid's risk header reads "±3%".
  Draft search text matches "1% · fixed".

