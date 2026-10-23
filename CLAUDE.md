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
  Model: `FXA_AGENT_MODEL` (default claude-haiku-5-5, effort medium), one run per book state and home currency,
  cached for days; the demo snapshot stores one run per home currency. No key or an error → rule-based fallback.
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
  uses rules only. The agent plan itself is cached per book state, so visitors cannot multiply model calls.
- UI, README and demo video are in **English** (judges). Code comments in English.
- Run `npm test` before every push.
