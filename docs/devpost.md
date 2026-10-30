# Devpost submission — draft

Field by field, in the order of the Devpost form. Text in [square brackets] is for you to fill in or confirm.
⚠️ The access code goes **only** into the Devpost "testing instructions" field — never into this public repo.

---

## Project name

FX Exposure Agent

## Elevator pitch (max 200 characters)

When a client abroad pays late, an AI agent writes the PayPal reminder or early-payment offer in your voice. You approve with one click, and it goes out through PayPal.

*(168 characters)*

---

## About the project (story — Markdown)

### Inspiration

Monday morning, a freelance designer in the US opens her PayPal invoices: a client in Paris is 18 days late on €1,800,
and one in Tokyo is 8 days late on ¥310,000. Writing those reminders is the job she keeps putting off — and until the
money arrives, the exchange rate decides how much she actually earns. Freelancers and small sellers who bill abroad
wait weeks to be paid, and late payers make the wait longer. Large companies have treasury teams for this. A
one-person business finds out at the end, when the payment lands.

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

[Optional, one sentence about you — e.g. "I work with exchange-rate risk every day, and wanted to give a one-person
business the view a treasury desk has."]

### What it does

**What she's waiting for, at a glance.** The app reads the seller's open PayPal invoices and shows how much is still
owed from clients abroad, what is already overdue, and what a 3% move either way would do to it. That last figure is
the size of the risk, not a forecast.

**The day's work, done with a click.** An AI agent goes through the invoices and proposes today's actions: a reminder
for an overdue invoice, written for that client, or a small early-payment discount on a large invoice that isn't due
for two months — shown as a price for getting paid weeks sooner, with its cost as a yearly rate. A discount is not an
exchange-rate hedge (a known cost if taken; a rate move can go either way), so the app never sells it as one. The offer
is a separate early-payment invoice that lapses after its date — the seller's own invoice never changes, and the client
gets the discount only by paying early. The seller approves; the action runs in
PayPal; the card shows "sent". When the client pays, the card shows "paid", the top of the screen shows
"+ collected" with the amount, and what is still waiting goes down ("Start of today → now").

**When the money comes in.** A week-by-week chart of money from clients abroad: as invoiced, and if clients pay as the
agent proposes — late invoices count as not yet in, a reminded invoice is assumed paid within 7 days and an offer by its
new due date, net of the discount. The headline line says how much would arrive within two weeks either way. It is
labelled a scenario, not a promise.

**Where the risk sits (AG Grid).** Every open invoice in one grid, ranked by what it puts at risk, with what the
agent is doing about each one, any early-payment offer that is out, and how each client has paid before. Tick the
invoices with a proposal waiting and approve them together — a confirmation lists exactly what will run, and each one
goes through the same checks as a single approval. Open any invoice (▸) to see, right under it, how that client has
paid before next to the agent's draft for it — and approve just that one. Not happy with the wording? Edit the e-mail
or pick another discount right in the grid; her edit goes through the same checks as the agent's text before it reaches
PayPal. One click narrows it to what needs attention —
Late, Agent acting, Offers out, Paid today — and the total row follows. When the client pays, PayPal's webhook updates
the book and the changed cells flash; the paid invoice stays in the list, greyed, so the seller sees what just happened.
Searchable, sortable, and downloadable as CSV.

**Evidence, not forecasts.** Two years of ECB rates show how far each currency moved for money that waited 7 to 90
days, and replay the seller's open book: paid the way the agent proposes, it would have moved in a narrower range
(the screen says how much narrower, recomputed daily). History, labelled as history.

**Before the next invoice.** The seller types "Bill Sakura Games ¥480,000 for the level art pack, net 45". Claude turns
it into an invoice; the app prices four ways to bill it — as asked, in dollars, on 14-day terms, half up front — using
that client's own payment history, and Claude compares them in plain words. One click creates and sends it in PayPal.

**Try it with your own invoices.** Any seller can paste an invoice list (CSV — an export from PayPal or any invoicing
tool) at /try and see the same analysis on their own numbers: what is waiting from clients abroad in any ECB currency,
what is late, where the exchange-rate risk sits, and what the agent would do today (rule-based for everyone; Claude's
own plan with the access code). Nothing is stored and no PayPal account is touched.

**Routine work handed over.** The seller approves a standing policy once (reminders yes; discounts up to 1%; at most
three actions a run). Every weekday morning the agent runs what fits; everything else still waits for a click, and
terms she set in the last 7 days are never changed on its own. The
policy is stored in the seller's PayPal account as an invoice template.

The app never says which way rates will go and never says which option is better. It shows the cost and the risk side
by side; the seller decides.

### How I built it

- **PayPal Invoicing API v2 (sandbox)** is the backbone: listing and reading invoices, creating and sending them,
  sending reminders, sending a separate early-payment offer invoice (paying it settles the original), recording
  payments, and cancelling. Every
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
  its own and run what the seller's approved policy covers — except that it never changes the terms of an invoice sent
  in the last 7 days: she just chose them, so an offer there waits for her click.
- **A checker on every sentence Claude writes**: only numbers that appear in the facts it was given, each figure under
  its own label, no forecasts, no advice, no links, no conditional promises to clients. A draft that fails goes back to
  Claude with the reason and is rewritten; the seller can see how many were.
- **Next.js 16 on Vercel**: server actions re-check everything before calling PayPal; a shared cache keeps one agent
  plan per day and currency; Vercel Cron warms the plans, resets the demo book nightly and runs the autopilot.
- **AG Grid Community**, two linked grids on "Where it sits": the exposure heatmap (currency × due-date bucket, heat
  shading by value) — click a cell and the invoice grid below narrows to that currency and bucket — and the invoice grid:
  row selection (checkboxes only on rows with a proposal waiting) to approve
  several actions at once through the same server action, full-width detail rows (client's paid invoices + the agent's
  draft + approve one) kept under their invoice through sorting and filtering, cell editing of the agent's draft (the
  built-in large-text editor for the e-mail, a custom React editor for the discount, both re-checked on the server), a two-line client cell with the client's payment history,
  an external filter for the quick views, a pinned total row that follows
  the filter, cell change flash on PayPal updates, row class rules, custom cell renderers (risk bars, PayPal links),
  quick-filter search and a CSV export with plain numbers. **AG Charts Community** for the money-in timeline (grouped
  bars by week, themed from the page's colours). **ECB reference rates via Frankfurter** for exchange rates.

### Challenges I ran into

- **The early-payment-discount endpoint returned HTTP 500 in the sandbox** for every variant I tried. My first
  workaround edited the sent invoice, which made the discount unconditional — the client kept it even when paying late,
  and a reviewer rightly called that the agent undercutting the seller. Now the offer is its own PayPal invoice: the
  discounted amount, due on the earlier date. If the client pays it, a verified PayPal webhook settles the original; if
  the date passes, the offer lapses and the seller's invoice applies, unchanged.
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
- Measured over 48 agent runs (306 proposals): 0 problems when every final output was re-checked by code afterwards
  (the app's own rules, applied again independently — a self-check, not an outside audit), including 10 runs with
  seller notes that told the agent to break its rules and a request to tell clients "the yen will fall" (declined, with
  a reason); 118 drafts were caught and rewritten. A daily plan costs about $0.01.

### What I learned

[e.g. "That the hardest part of putting AI on money is not the model, it's deciding what it must never say."]
[Add one line from the user tests.]

### What's next for FX Exposure Agent

- Live PayPal accounts behind a proper login, so real sellers can connect their own invoices.
- PayPal's own conditional early-payment discount once its endpoint works, in place of the separate offer invoice.
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

1. **The daily agent.** Claude runs as a tool-using agent (Anthropic SDK tool runner) over seven tools that read the
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

Also used: **AG Grid Community** (the exposure heatmap and the invoice grid, linked), **AG Charts Community** (the
money-in timeline), **Vercel** (hosting, cron, shared cache).

---

## Testing instructions (Devpost field only — not in the repo)

1. Open https://fx-exposure-agent.vercel.app. Everything is visible without a code.
2. To run actions on the PayPal sandbox, enter the access code **[ACCESS CODE]** in the box at the top.
3. **Today:** approve a proposal, then "Simulate client payment" in the same card (or "Open as client ↗" to pay on
   PayPal's page with the sandbox buyer account **[buyer e-mail / password]**). Watch "+… collected" appear at the top.
4. Steps 2–5: the invoice grid, the two-year evidence, "Next invoice" (describe an invoice in a sentence) and
   "Autopilot" (approve a policy, then "Run autopilot now").
5. "Reset the demo book" (Today → Sandbox controls) starts the story over; the book also resets every night at 00:07 UTC.

Everything runs in the PayPal sandbox; no real money moves. The site will stay up until judging ends (Dec 15).
