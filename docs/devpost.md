# Devpost submission — draft

Field by field, in the order of the Devpost form. Text in [square brackets] is for you to fill in or confirm.
⚠️ The access code goes **only** into the Devpost "testing instructions" field — never into this public repo.

---

## Project name

FX Exposure Agent

## Elevator pitch (max 200 characters)

Know what exchange rates can take from your unpaid PayPal invoices — and shrink it in one click. An AI agent proposes the day's PayPal actions; you approve.

*(156 characters)*

---

## About the project (story — Markdown)

### Inspiration

Freelancers and small sellers who bill abroad wait weeks to be paid. A designer in the US with clients in Europe,
the UK and Japan sends invoices in euros, pounds and yen through PayPal — and from that moment until the money
arrives, the exchange rate decides how much she actually earns. Late payers make the wait longer. Large companies have
treasury teams for this. A one-person business finds out at the end, when the payment lands.

- **Many people work this way.** 64 million Americans freelanced in 2023, 38% of the U.S. workforce
  ([Upwork, Freelance Forward 2023](https://investors.upwork.com/news-releases/news-release-details/upwork-study-finds-64-million-americans-freelanced-2023-adding)).
  In Payoneer's 2023 survey of over 2,000 freelancers in 122 countries, 32% had expanded their client base to new
  countries ([Payoneer 2023 Freelancer Insights](https://www.payoneer.com/resources/business/the-payoneer-2023-freelancer-insights-report/)).
- **Money that crosses a border runs through PayPal.** In 2025 PayPal processed $1.79 trillion, and 12% of it was
  cross-border — mostly between PayPal accounts in different countries, about $215 billion
  ([PayPal 10-K for 2025](https://s205.q4cdn.com/875401827/files/doc_financials/2025/q4/10-K.pdf); the dollar figure is 12% × $1.79 trillion).
- **The wait is long and often longer than agreed.** In Bonsai's analysis of three years of its users' invoices, 29%
  of freelance invoices were paid at least a day late; 90% of the late ones were paid within a month
  ([Bonsai](https://www.hellobonsai.com/blog/late-freelance-payment)).
- **While it waits, the money moves.** Over the last two years of ECB rates, foreign money that waited 60 days moved by
  several percent either way against the home currency — the app's Evidence step shows the exact range for each
  currency, recomputed daily. History, not a forecast.

[Optional, one sentence about you — e.g. "I work with exchange-rate risk every day, and wanted to give a one-person
business the view a treasury desk has."]

### What it does

**One number to watch.** The app reads the seller's open PayPal invoices and shows what a 3% move either way would do
to the money still owed in foreign currencies — for the demo book, about [$929] on [$31,000]. It is the size of the
risk, not a forecast.

**The day's work, done with a click.** An AI agent goes through the invoices and proposes today's actions: a reminder
for an overdue invoice, written for that client, or a small early-payment discount on a large invoice that isn't due
for two months — with its cost shown next to how much uncertainty it removes. The seller approves; the action runs in
PayPal; the card shows "sent". When the client pays, the card shows "paid" and the number at the top goes down:
"Start of today $929 → now $845".

**Where the risk sits.** Every open invoice in one grid, ranked by what it puts at risk, with what the agent is doing
about each one — searchable, sortable, and downloadable as CSV.

**Evidence, not forecasts.** Two years of ECB rates show how far each currency moved for money that waited 7 to 90
days, and replay the seller's open book: paid the way the agent proposes, it would have moved in a range about [42]%
narrower. History, labelled as history.

**Before the next invoice.** The seller types "Bill Sakura Games ¥480,000 for the level art pack, net 45". Claude turns
it into an invoice; the app prices four ways to bill it — as asked, in dollars, on 14-day terms, half up front — using
that client's own payment history, and Claude compares them in plain words. One click creates and sends it in PayPal.

**Routine work handed over.** The seller approves a standing policy once (reminders yes; discounts up to 1%; at most
three actions a run). Every weekday morning the agent runs what fits; everything else still waits for a click. The
policy is stored in the seller's PayPal account as an invoice template.

The app never says which way rates will go and never says which option is better. It shows the cost and the risk side
by side; the seller decides.

### How I built it

- **PayPal Invoicing API v2 (sandbox)** is the backbone: listing and reading invoices, creating and sending them,
  sending reminders, editing a sent invoice (discount and new due date), recording payments, and cancelling. Every
  action the agent takes is written into the invoice's private memo, so the history lives in PayPal, not in my
  database (there isn't one).
- **PayPal invoice templates** store the seller's standing policy and notes for the agent.
- **PayPal webhooks** (`INVOICING.INVOICE.PAID` and other invoice events), each verified with PayPal's
  verify-webhook-signature endpoint, tell the app when an invoice changes, so the seller's screen updates on its own.
- **Claude (Anthropic API) as an agent with tools** — `get_exposure`, `list_open_invoices`, `price_discount`,
  `propose_reminder`, `propose_early_payment_discount`, `skip_invoice`, `submit_summary`. It decides what to propose and
  writes the e-mails and the reasons. Code decides which invoices are eligible and computes every number.
- **PayPal's own MCP server**, connected through Claude's MCP connector: Claude reads each invoice directly in PayPal
  (`get_invoice`, `search_invoicing` — an allowlist, read-only) and names the billed work in the reminder. Writes never go
  through MCP; they take the checked, approved path.
- **The agent works three ways**: a daily plan; plain-words requests from the seller ("Chase everyone more than 10 days
  late, gently"); and PayPal events — a verified `INVOICING.INVOICE.SENT` webhook makes it look at the new invoice on
  its own and run what the seller's approved policy covers.
- **A checker on every sentence Claude writes**: only numbers that appear in the facts it was given, each figure under
  its own label, no forecasts, no advice, no links, no conditional promises to clients. A draft that fails goes back to
  Claude with the reason and is rewritten; the seller can see how many were.
- **Next.js 16 on Vercel**: server actions re-check everything before calling PayPal; a shared cache keeps one agent
  plan per day and currency; Vercel Cron warms the plans, resets the demo book nightly and runs the autopilot.
- **AG Grid Community** for the invoice grid; **ECB reference rates via Frankfurter** for exchange rates.

### Challenges I ran into

- **The early-payment-discount endpoint returned HTTP 500 in the sandbox** for every variant I tried. Instead, the
  agent edits the sent invoice — discount plus an earlier due date — and re-sends it. That makes the discount
  unconditional, so the screen and the client's note say exactly that.
- **A language model will happily write "the euro is likely to weaken" or call a stress test a "typical swing".** In a
  money product that is not acceptable, so every sentence is checked by code and rewritten until it passes.
- **Speed in the middle of the loop.** At first, every approval changed the book and made the agent re-plan for 20–30
  seconds. Now the agent plans once a day, and each proposal is matched with what has since happened to its invoice:
  approve → sent in about 5 seconds, pay → paid in about 3.
- **Webhooks in the sandbox**: a payment recorded through the API raised no webhook event, so the demo has a "Simulate client
  payment" button for that path. A payment made on PayPal's own invoice page does raise one: the seller's screen shows
  it as paid in under 20 seconds.
- Smaller ones: PayPal doesn't invoice in Korean won, so the "bill in your home currency" option is hidden for a KRW
  seller; the public rates API rounds when the base is KRW, so rates are crossed from EUR instead.

### Accomplishments that I'm proud of

- The whole loop — risk, proposal, approval, PayPal, payment, lower risk — runs on one screen in about ten seconds, on
  the real PayPal sandbox.
- The AI is genuinely in charge of judgement (what to propose, how to say it) while code stays in charge of every
  number and every permission.
- Measured over 48 agent runs (283 proposals): 0 problems in the final output, including 10 runs with seller notes that
  told the agent to break its rules and a request to tell clients "the yen will fall" (declined, with a reason); 128
  drafts were caught and rewritten. A daily plan costs about $0.01.

### What I learned

[e.g. "That the hardest part of putting AI on money is not the model, it's deciding what it must never say."]
[Add one line from the user tests.]

### What's next for FX Exposure Agent

- Live PayPal accounts behind a proper login, so real sellers can connect their own invoices.
- True conditional early-payment discounts once the API accepts them in production.
- Weekly e-mail summary: what the agent did, what was paid, how much risk is left.

### User tests

[After Nov 7–9: "Three freelancers who invoice abroad tried it. …" — one or two honest lines and a short quote.]

---

## Built with (tags)

paypal, paypal-invoicing-api, paypal-webhooks, claude, anthropic, next.js, react, typescript, vercel, ag-grid, frankfurter, zod, vitest

## Try it out (links)

- Live demo: https://fx-exposure-agent.vercel.app
- Code: https://github.com/newsyahk-dot/fx-exposure-agent

## Video

[YouTube link — public]

---

## Tools — which AI model or service, and how it is used

**Claude Haiku 5.5 (Anthropic API)**, used in four places:

1. **The daily agent.** Claude runs as a tool-using agent (Anthropic SDK tool runner) over six tools that read the
   seller's PayPal invoices, price discount terms and record proposals. It decides which actions to put in front of the
   seller and writes each client e-mail, each invoice note and each reason. Every number it may use comes from the
   tools; every sentence is checked by code before it is accepted, and rejected drafts are returned to it with the
   reason. One plan per day and home currency, shared across visitors, with prompt caching (about $0.01 a plan).
2. **Reading an invoice request.** Claude turns a sentence like "Bill Sakura Games ¥480,000, net 45" into structured
   invoice fields (structured output, validated with Zod).
3. **Comparing billing options.** Claude writes a short, neutral comparison of the options the code priced — checked
   the same way, and never allowed to say which is better.
4. **The autopilot** reuses the day's plan and runs only the proposals inside the seller's approved policy.

Without an API key, or if a call fails, rule-based proposals with fixed wording take over, so the app keeps working.

Also used: **AG Grid Community** (the invoice grid), **Vercel** (hosting, cron, shared cache).

---

## Testing instructions (Devpost field only — not in the repo)

1. Open https://fx-exposure-agent.vercel.app. Everything is visible without a code.
2. To run actions on the PayPal sandbox, enter the access code **[ACCESS CODE]** in the box at the top.
3. **Today:** approve a proposal, then "Simulate client payment" in the same card (or "Open as client ↗" to pay on
   PayPal's page with the sandbox buyer account **[buyer e-mail / password]**). Watch the number at the top go down.
4. Steps 2–5: the invoice grid, the two-year evidence, "Next invoice" (describe an invoice in a sentence) and
   "Autopilot" (approve a policy, then "Run autopilot now").
5. "Reset the demo book" (Today → Sandbox controls) starts the story over; the book also resets every night at 00:07 UTC.

Everything runs in the PayPal sandbox; no real money moves. The site will stay up until judging ends (Dec 15).
