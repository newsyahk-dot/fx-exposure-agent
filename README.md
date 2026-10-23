# FX Exposure Agent

**Know how much of the money you're owed is riding on exchange rates — and shorten it with one approved click.**

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/).

> 🚧 Work in progress — submission due Nov 12, 2026.

## The problem
Solo sellers and freelancers who invoice clients abroad through PayPal are paid in USD, EUR or JPY weeks after
they do the work. Until the money lands, every rate move changes what they actually earn — but no tool shows
them *how much* is exposed, *in which currency*, and *for how long*.

## What it does
1. **Reads your PayPal invoices** (sandbox) and stacks the unpaid amounts by currency and by the week they fall due,
   valued in **your home currency** (USD, EUR, GBP, JPY or KRW) at ECB reference rates, with a ±3% stress test.
2. **Shows what the wait already did**: for money received in the last 90 days, how much more or less it was worth on
   the day it arrived than on the day it was invoiced — and how much of that came from late payments.
3. **An AI agent plans the actions.** Claude (Haiku 5.5) reads the book through tools — `get_exposure`,
   `list_open_invoices`, `price_discount` — and decides what to propose: a payment reminder with an e-mail it writes
   for that client, or an early-payment discount on terms it picks, or nothing (with its reason).
4. **Code keeps the agent honest.** Code decides which invoices are eligible and computes every number. Every piece of
   text the agent writes is checked before it is accepted: only numbers from the facts, each figure under its own
   label, no forecasts, no advice, no links, no conditional promises. A rejected draft goes back to the agent with
   the reason, and it rewrites it — the screen shows how many drafts were rejected and every step it took.
5. **Executes only what you approve** — you can edit the e-mail first — and the server re-checks everything before
   calling PayPal. Then it recalculates.
6. **Shows the evidence from history, not a forecast.** Over two years of ECB fixings: how far each currency moved
   against your home currency for money that waited 7 to 90 days (nine times out of ten), and your open book replayed
   over the same history — once on the current due dates, once as the agent's proposals would have it, with the
   payment-timing assumptions printed next to the result.
7. **Helps before an invoice goes out.** Describe it in a sentence ("Bill Sakura Games ¥480,000 for the level art pack,
   net 45"). Claude reads it into fields; code prices each way of billing — as asked, in your home currency, shorter
   terms, half up front — from that client's payment history (average days late) and the ECB rates; Claude compares
   them in plain words, under the same checks. You approve one and it is created and sent in PayPal.

It never predicts which way rates will go.

## Status
- [x] Exposure engine — currency × due-week table, symmetric shock, 1-sigma swing, any home currency (`src/lib`)
- [x] PayPal sandbox integration — Invoicing v2 client (`src/lib/paypal.ts`), 18-invoice demo book (`src/lib/seed-data.ts`)
  - Reminders work in sandbox. The early-payment-discount rule endpoint (`/conditional-rules`) returns HTTP 500
    for every variant tried (2026-10-23), so the agent edits the sent invoice instead: discount + earlier due date,
    re-sent. The discount is then unconditional, and the screen and the client note say so.
  - Transaction Search and Balances return 403 for this app, so the timing effect is computed from each paid
    invoice's own payment dates.
- [x] Agent with tools, text checks and a rule-based fallback (`src/lib/agent.ts`, `src/lib/checks.ts`)
- [x] Approve → execute → recalculate, with editable drafts re-checked on the server (`src/app/actions.ts`); every
  action is logged in the invoice's private memo (`src/lib/agent-log.ts`), so it survives redeploys
- [x] Timing effect over the last 90 days (`src/lib/timing.ts`)
- [x] Two-year evidence: range by wait and the book replayed under two payment timelines (`src/lib/evidence.ts`)
- [x] New-invoice assistant (`src/lib/invoice-plan.ts`, `src/app/invoice-actions.ts`). PayPal does not invoice in
  KRW, so a KRW seller bills in USD, EUR, GBP or JPY and the "bill in your home currency" option is not offered.
- [x] Demo mode — `DEMO_MODE=1` (or no PayPal keys) serves `src/data/demo-snapshot.json`, which stores one agent run per
  home currency, so the demo never calls PayPal or the model
- [x] Demo reset — `npm run sandbox:seed -- --reset --apply` closes the open seed invoices and seeds a new generation
- [ ] Hosted demo

## Run locally
```bash
npm install
cp .env.example .env.local   # fill in sandbox credentials
npm test
npm run sandbox:seed -- --apply   # seed the sandbox seller (idempotent; dry run without --apply)
npm run sandbox:check             # reminder + discount checks on throw-away CHK- invoices
npm run sandbox:exposure          # read-only: exposure table + proposals from the live sandbox
npm run dev
```

## Data
Exchange rates: ECB euro foreign exchange reference rates, via [Frankfurter](https://frankfurter.dev).

## License
MIT
