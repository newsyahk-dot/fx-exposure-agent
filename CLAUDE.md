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
  "Re-plan" (access code) expires the plan tag. The demo snapshot stores one run per home currency. No key or an
  error → rule-based fallback.
- **Ask the agent** (Today, `?ask=`, `src/app/ask-agent.tsx`, `askFor` in `src/lib/agent-cache.ts`): the seller's sentence goes to
  the same agent as a `<seller_request>` (data, like notes — it cannot change rules, eligibility or numbers); the answer
  and cards render like the plan and use the same approve path. Needs the access code; cached per request for hours.
  The final summary goes through the checked `submit_summary` tool, so a refusal is rewritten instead of withheld.
- **Agent reacts to PayPal events**: a verified `INVOICING.INVOICE.SENT` webhook for a non-seed invoice runs
  `reactToNewInvoices` (`src/lib/autopilot.ts`) in `after()`: the agent looks at open invoices the day's plan has not
  seen (`newInvoicesRequest`, cached per set of invoices), and proposals inside the approved policy run through the same
  path as the autopilot. Today shows the answer under "New since today's plan". Sandbox sends CREATED/SENT for
  API-created invoices (measured 2026-10-26). Seed invoices are skipped so a reset does not start 22 runs.
- **Home currency** is chosen on screen (`?base=`), default `FXA_DEFAULT_BASE` or USD. Raw ECB quotes are stored, so any
  of USD/EUR/GBP/JPY/KRW works in live and demo mode.
- **What the agent puts in front of the seller** follows a stated rule of thumb: an offer is proposed only if its
  reduction in 1σ swing is larger than its cost; both numbers are shown and the seller decides. Change the rule in the
  prompt *and* this line together.
- **New invoices** (`src/lib/invoice-plan.ts`): Claude only reads the seller's sentence into fields and writes the
  comparison (same checks, never says which option to pick). Code computes every option from the client's payment
  history and ECB rates; the create action re-validates and recomputes before calling PayPal. No KRW invoices (PayPal).
- **Evidence** (`src/lib/evidence.ts`) is history over two years of ECB fixings, always labelled "not a forecast",
  with the payment-timing assumptions shown on screen.
- **Hosted demo access**: with `FXA_ACCESS_CODE` set, every write action and every on-demand model call needs the code
  (httpOnly cookie holding a hash, `src/lib/access.ts`); every server action checks it. Without the code the planner
  uses rules only. The agent plan is one per day, so visitors cannot multiply model calls.
- **API cost** (measured 2026-10-24, Haiku 5.5 $0.10/$0.50 per MTok): one agent plan ≈ $0.004–0.006 with prompt caching (eval 2026-10-26: $0.0056 mean over 40 plans, `docs/agent-eval.md`)
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
- UI, README and demo video are in **English** (judges). Code comments in English.
- Run `npm test` before every push.
