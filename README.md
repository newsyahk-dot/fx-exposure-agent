# FX Exposure Agent

**Know how much of the money you're owed is riding on exchange rates — and shorten it with one approved click.**

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/).

> 🚧 Work in progress — submission due Nov 12, 2026.

## The problem
Solo sellers and freelancers who invoice clients abroad through PayPal are paid in USD, EUR or JPY weeks after
they do the work. Until the money lands, every rate move changes what they actually earn — but no tool shows
them *how much* is exposed, *in which currency*, and *for how long*.

## What it does
1. **Reads your PayPal invoices** (sandbox) and stacks the unpaid amounts by currency and by the week they fall due.
2. **Values them in your home currency** using ECB reference rates, and shows what a ±3% move would do.
3. **Proposes PayPal actions** that shorten the exposure — a reminder for an overdue invoice, an early-payment
   discount on a large one due far out — with the cost and the size of the FX swing side by side.
4. **Executes only what you approve**, then recalculates.

It never predicts which way rates will go.

## Status
- [x] Exposure engine — currency × due-week table, symmetric shock, 1-sigma swing (`src/lib`)
- [x] PayPal sandbox integration — Invoicing v2 client (`src/lib/paypal.ts`), 18-invoice demo book (`src/lib/seed-data.ts`)
  - Reminders work in sandbox. The early-payment-discount rule endpoint (`/conditional-rules`) returns HTTP 500
    for every variant tried (2026-10-23), so the fallback edits the sent invoice: 1% off + earlier due date, re-sent.
- [ ] Agent: propose → approve → execute → recalculate
- [ ] UI and hosted demo

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
