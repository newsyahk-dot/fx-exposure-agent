# FX Exposure Agent

**Know what exchange rates can take from your unpaid PayPal invoices — and shrink it in one click.**

Live demo: **https://fx-exposure-agent.vercel.app** (PayPal sandbox — no real money). Judges: the access code that
lets you run the agent's actions is in the Devpost testing instructions; without it you can look around.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/).

## Who it's for

A freelance designer in the US invoices clients in Europe, the UK and Japan through PayPal. Right now about $31,000
of her income is waiting in euros, pounds and yen, some of it already overdue. Every week it waits, a move in the
exchange rate changes what she will actually be paid — and nothing tells her how much is at stake, or which invoice
to deal with first.

## What she gets

1. **One number to watch.** "If rates move 3% either way, your unpaid foreign invoices change by about $929" — up or
   down, equally likely; the size of the risk, not a forecast.
2. **The day's work, done with a click.** An AI agent reads her PayPal invoices and proposes today's actions:
   a reminder for the overdue invoice from London, written for that client; a small early-payment discount on a
   large invoice that isn't due for two months, with its cost next to how much risk it removes. She approves, and it
   runs in PayPal.
3. **The loop closes on its own.** When the client pays, PayPal notifies the app and the number on her screen goes
   down, with "start of today → now" and a note of which payment did it.
4. **Help before the next invoice.** She types "Bill Sakura Games ¥480,000 for the level art pack, net 45" and sees
   what billing in yen, in dollars, on shorter terms or half up front would leave at risk, using that client's own
   payment history. She picks one; it is created and sent in PayPal.
5. **Routine work handed over.** She approves a standing policy once (for example: reminders yes, discounts no more
   than 1%), and an autopilot runs the proposals that fit it every weekday morning. Anything else still waits for her.

The app never says which way rates will go, and never says which option is better. It shows the cost and the risk
side by side; she decides.

## Try it (about two minutes)

1. Open the live demo and enter the access code.
2. **Today:** approve a proposal. It runs in the PayPal sandbox (a reminder e-mail or an edited invoice).
3. In the same card, pay it as the client — "Open as client ↗" for the real PayPal invoice page, or
   "Simulate client payment". Watch the number at the top go down.
4. **Next invoice:** describe an invoice in a sentence and compare the options.
5. **Autopilot:** approve a policy and press "Run autopilot now".

"Reset the demo book" (under sandbox controls on Today) starts the story over; it also resets every night.

## How it works

- **PayPal (sandbox), Invoicing v2:** list, create, send, remind, update (discount and due date), record payments;
  invoice templates store the seller's standing policy; webhooks (`INVOICING.INVOICE.PAID` and other invoice events,
  each verified with PayPal) update the screen when a client pays.
- **Claude as an agent with tools** (`get_exposure`, `list_open_invoices`, `price_discount`, `propose_reminder`,
  `propose_early_payment_discount`, `skip_invoice`). It decides what to propose and writes the e-mails and the reasons.
  It makes one plan per day; each proposal is then matched with what has happened to its invoice since (sent, paid).
- **Code decides every number and every permission.** Which invoices are eligible, every amount, every cost. Nothing
  runs in PayPal without an approval click — on that action, or on a standing policy that covers it — and the server
  re-checks everything before it calls PayPal.
- **Exchange rates:** ECB euro reference rates via [Frankfurter](https://frankfurter.dev), crossed into the home
  currency (USD, EUR, GBP, JPY or KRW). The typical swing (1σ) uses 120 days of daily moves, scaled by the square root
  of time; the 3% figure is a symmetric stress test.
- **Evidence, not forecasts:** over two years of ECB fixings, how far each currency moved for money that waited 7 to 90
  days, and the open book replayed on the current due dates versus the agent's proposals (assumptions on screen).

## Reliability

- Every text the model writes is checked by code before anyone sees it: only numbers that appear in the facts it was
  given, each figure under its own label (3% stress test vs typical swing), no forecasts, no advice, no links, no
  conditional promises to clients. A rejected draft goes back to the model with the reason and is rewritten.
- Without an API key, or if the model fails, rule-based proposals with fixed wording take over.
- Sandbox only: the PayPal client refuses any host but the sandbox. Secrets live in environment variables.
- Cost: one daily plan per home currency costs about $0.004 (Claude Haiku 5.5 with prompt caching); visitors and the
  autopilot reuse it.
- Known sandbox limits: the early-payment-discount rule endpoint (`/conditional-rules`) returns HTTP 500 for every
  variant tried, so the agent edits the sent invoice instead (the discount is then unconditional, and the screen and
  the client note say so). A payment recorded through the API does not raise a webhook event in the sandbox, so the
  "Simulate client payment" button updates the screen directly; a payment made on PayPal's invoice page reaches the
  screen through the webhook, or within a minute without it. Transaction Search and Balances return 403, so the timing effect is computed from
  each invoice's own payment dates.
- `npm test` covers the exposure maths, the agent's eligibility and fallbacks, every text check, the plan
  reconciliation, the webhook verification and the demo book.

## User tests

Planned for Nov 7–9 with three freelancers and small sellers who invoice abroad. Results will be added here.

## Run locally

```bash
npm install
cp .env.example .env.local        # sandbox credentials, app-only Anthropic key
npm test
npm run sandbox:seed -- --apply   # seed the sandbox seller (idempotent; dry run without --apply)
npm run dev
```

Other scripts: `npm run sandbox:exposure` (read-only check of the live book), `npm run sandbox:snapshot` (the demo
snapshot used when no PayPal keys are set), `npx tsx scripts/register-webhook.mts https://your-site` (PayPal webhook).

## License

MIT
