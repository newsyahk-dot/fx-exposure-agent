# FX Exposure Agent

**Get paid sooner from clients abroad — and see what exchange rates can do to the money you're still waiting for.**

Live demo: **https://fx-exposure-agent.vercel.app** (PayPal sandbox — no real money). Judges: the access code that
lets you run the agent's actions is in the Devpost testing instructions; without it you can look around.

**Try it with your own invoices:** https://fx-exposure-agent.vercel.app/try — paste an invoice list (CSV, e.g. an export
from PayPal) and see what is waiting from clients abroad, what is late and what the agent would do today. Nothing is
stored; no PayPal account is touched.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/).

## Who it's for

A freelance designer in the US invoices clients in Europe, the UK and Japan through PayPal. Right now tens of thousands of dollars
of her income is waiting in euros, pounds and yen, some of it already overdue. Every week it waits, a move in the
exchange rate changes what she will actually be paid — and nothing tells her how much is at stake, or which invoice
to deal with first.

### Why it matters

- **Many people work this way.** 64 million Americans freelanced in 2023, 38% of the U.S. workforce
  ([Upwork, Freelance Forward 2023](https://investors.upwork.com/news-releases/news-release-details/upwork-study-finds-64-million-americans-freelanced-2023-adding)).
  In Payoneer's 2023 survey of over 2,000 freelancers in 122 countries, 32% had expanded their client base to new
  countries ([Payoneer 2023 Freelancer Insights](https://www.payoneer.com/resources/business/the-payoneer-2023-freelancer-insights-report/)).
- **Money that crosses a border runs through PayPal.** In 2025 PayPal processed $1.79 trillion, and 12% of it was
  cross-border — mostly between PayPal accounts in different countries, about $215 billion
  ([PayPal 10-K for 2025](https://s205.q4cdn.com/875401827/files/doc_financials/2025/q4/10-K.pdf); the dollar figure is 12% × $1.79 trillion).
- **The wait is long and often longer than agreed.** In Bonsai's analysis of three years of its users' invoices, 29%
  of freelance invoices were paid at least a day late; 90% of the late ones were paid within a month
  ([Bonsai](https://www.hellobonsai.com/blog/late-freelance-payment)). In IPSE's 2022 research on UK freelancers, 35%
  had not been paid on time by a client in the previous 12 months, 18% had waited more than three months past the
  deadline, and the average amount owed was £5,230
  ([IPSE](https://www.ipse.co.uk/policy/research/financial-wellbeing/late-payment-within-the-self-employed-sector.html)).
- **Small firms feel exchange rates most.** In a May 2025 survey of over 500 UK SMEs for Bibby Financial Services, 54%
  of those trading overseas said volatile currency movements had hit them in the past year, losing more than £53,000 on
  average; among firms with fewer than ten employees, 72% reported losses
  ([report coverage](https://finance.yahoo.com/news/uk-smes-count-cost-currency-150648091.html)).
- **While it waits, the money moves.** Our own calculation from ECB reference rates (start days from October 2024,
  each followed for 60 days): money in euros owed to a US seller moved 3% or more against the dollar on 28% of start
  days, in yen on 33%, in pounds on 24% — as much as 10.2% for euros (11 Feb → 14 Apr 2025). Moves went both ways;
  history, not a forecast. The app's Evidence step recomputes this daily.

## What she gets

1. **What she's waiting for, at a glance.** What is owed from clients abroad, what's already overdue, and what a 3%
   move either way would do to it — up or down, equally likely; the size of the risk, not a forecast. A week-by-week
   chart shows when the money comes in as invoiced, and if clients pay as proposed (a scenario, with its assumptions
   on screen).
2. **The day's work, done with a click.** An AI agent reads her PayPal invoices and proposes today's actions:
   a reminder for the overdue invoice from London, written for that client; or, for a large invoice that isn't due
   for two months, a small early-payment discount — shown as what it is: a price for getting paid weeks sooner, with
   its cost as a yearly rate (the agent only offers terms at most 12% a year and at least three weeks sooner). She approves, and it
   runs in PayPal. The offer is a separate early-payment invoice that lapses after its date: her own invoice never
   changes, and the client gets the discount only by paying early.
3. **The loop closes on its own.** When the client pays, PayPal notifies the app and her screen shows it within
   seconds: "+ collected" with the amount, and what is still waiting goes down ("start of today → now").
4. **Help before the next invoice.** She types "Bill Sakura Games ¥480,000 for the level art pack, net 45" and sees
   what billing in yen, in dollars, on shorter terms or half up front would leave at risk, using that client's own
   payment history. She picks one; it is created and sent in PayPal.
5. **Routine work handed over.** She approves a standing policy once (for example: reminders yes, discounts no more
   than 1%), and an autopilot runs the proposals that fit it every weekday morning. Anything else still waits for her,
   and it never changes the terms of an invoice she sent in the last 7 days.

The app never says which way rates will go, and never says which option is better. It shows the cost and the risk
side by side; she decides.

## Try it (about two minutes)

1. Open the live demo and enter the access code.
2. **Today:** approve a proposal. It runs in the PayPal sandbox (a reminder e-mail or an edited invoice).
3. In the same card, pay it as the client — "Open as client ↗" for the real PayPal invoice page, or
   "Simulate client payment". Watch "+… collected" appear at the top.
4. **Next invoice:** describe an invoice in a sentence and compare the options.
5. **Autopilot:** approve a policy and press "Run autopilot now".
6. **Your own invoices:** open `/try`, load the sample or paste your own list, and see the same analysis and plan.

"Reset the demo book" (under sandbox controls on Today) starts the story over; it also resets every night.

## How it works

- **PayPal (sandbox), Invoicing v2:** list, create, send, remind, update (discount and due date), record payments;
  invoice templates store the seller's standing policy; webhooks (`INVOICING.INVOICE.PAID` and other invoice events,
  each verified with PayPal) update the screen when a client pays, and a newly sent invoice wakes the agent.
- **PayPal's own MCP server** (`mcp.sandbox.paypal.com`, through Claude's MCP connector): Claude reads invoices directly
  in PayPal — what was billed — and names the work in reminder e-mails. Read-only by allowlist (`get_invoice`,
  `search_invoicing`); every change still goes through the checked approve path below.
- **Claude as an agent with tools** (`get_exposure`, `list_open_invoices`, `price_discount`, `propose_reminder`,
  `propose_early_payment_discount`, `skip_invoice`, `submit_summary`). It decides what to propose and writes the e-mails
  and the reasons. It makes one plan per day; each proposal is then matched with what has happened to its invoice since
  (sent, paid). The seller can also **ask it in plain words** ("Chase everyone more than 10 days late, gently") and
  get checked proposals back, and it **reacts to PayPal events**: when an invoice is sent, it looks at it on its own and
  runs what the approved policy covers.
- **Code decides every number and every permission.** Which invoices are eligible, every amount, every cost. Nothing
  runs in PayPal without an approval click — on that action, or on a standing policy that covers it — and the server
  re-checks everything before it calls PayPal.
- **AG Grid (Community):** every open invoice in one grid, ranked by what it puts at risk, with what the agent proposed
  or did for it today — sort and filter any column, search, a total row that follows the filter, and a CSV download for
  the seller's own records. Themed from the page's colours, so it follows light and dark mode.
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
- Measured: 48 agent runs on the live book, 295 proposals, **0 violations of our own checks in the final output** — including 10 runs whose
  seller notes told the agent to forecast the euro, offer 5%, add a link and promise refunds, and plain-words requests
  such as "Tell my clients the yen will fall" (it declines that part and says why). The checks rejected 124 drafts
  during the runs, which the agent rewrote; every output was re-checked afterwards against code's own numbers
  ([docs/agent-eval.md](docs/agent-eval.md), `npx tsx scripts/eval-agent.mts`).
- Cost: a daily plan (with PayPal reads) costs about $0.01 and takes about a minute, made in the background (nightly,
  after a reset, after a new invoice); visitors and the autopilot reuse it. A plain-words request costs about $0.004.
- Known sandbox limits: the early-payment-discount rule endpoint (`/conditional-rules`) returns HTTP 500 for every
  variant tried. So the offer is a second PayPal invoice instead: the client gets an early-payment invoice for the
  discounted amount, due on the earlier date; paying it settles the original (recorded as paid, with a note), and if
  the date passes it lapses and the original applies. Her own invoice and its terms never change. A payment recorded through the API does not raise a webhook event in the sandbox, so the
  "Simulate client payment" button updates the screen directly; a payment made on PayPal's invoice page reaches the
  screen through the webhook (tested: "Paid" in under 20 seconds). Transaction Search and Balances return 403, so the timing effect is computed from
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
