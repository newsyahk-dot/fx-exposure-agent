# Demo video — script and shot list (target 2:50, hard limit 3:00)

Judges score five things equally: technical implementation, design, potential impact, innovation, presentation
("does the video show it working end to end; what problem, for whom, why it matters"). The first 30 seconds must run the
whole loop once. Everything shown must work exactly as shown (Official Rules: "must function as depicted in the video").

Numbers on screen change with the day's ECB rates. Read them from the screen while recording; the narration below
uses "about" and placeholders in [brackets].

---

## 0:00–0:30 — The loop, once (Today)

| Time | Screen | Narration |
|---|---|---|
| 0:00 | **Today**, home currency USD. Big number "[$929]". | "Maya is a freelance designer in the US. Her clients in Europe, the UK and Japan pay her through PayPal invoices. Right now about [$31,000] of her income is waiting in euros, pounds and yen — and if rates move three percent, about [$929] of it moves with them. Nothing in her inbox tells her that." |
| 0:12 | Scroll to the card **"Chase a late payment · Hollis & Grey · £2,100 · 15 days overdue"**. | "Every morning an AI agent goes through her open invoices and proposes the day's work." |
| 0:17 | Click **Approve: send reminder**. Card turns to **"✓ Reminder sent in PayPal"**. | "One click, and the reminder goes out through PayPal." |
| 0:21 | In the same card: **Open as client ↗** → pay on PayPal's invoice page with the sandbox buyer → back to the app (cut the wait in editing). Card → **"✓ Paid"**; top shows **"Start of today [$929] → now [$845] (−[$84] paid today)"** and the green "Paid today" note; the big number counts down with a "−$84 off your risk" badge, and the bar above the cards turns that slice green. | "When the client pays, her number goes down — that money no longer depends on the exchange rate." |

> Note: the webhook was verified on 2026-10-26 ("Paid" in under 20 s after paying on PayPal's page). Log in to the
> sandbox buyer in that browser before recording. Fallback if PayPal's page misbehaves: "Simulate client payment".

## 0:30–0:50 — Who it's for and why it matters

| Time | Screen | Narration |
|---|---|---|
| 0:30 | Slow scroll back to the top of Today. | "Freelancers and small sellers who bill abroad wait weeks to be paid. While they wait, the exchange rate decides how much they actually earn — and late payers make the wait longer. Banks hedge this for big companies; a one-person business just finds out at the end." |
| 0:42 | Hold on the hero line "Up or down — equally likely. The size of the risk, not a forecast." | "This app never predicts where rates go. It shows how much is at stake and helps her shorten the wait." |

## 0:50–1:25 — How the agent decides (technical, AI)

| Time | Screen | Narration |
|---|---|---|
| 0:50 | Card **"Offer 1% off to be paid within 10 days · Sakura Games · ¥760,000"**: cost [$48], typical swing [±$164 → ±$68]. | "For a large invoice that isn't due for two months, the agent can suggest a small early-payment discount. It shows the cost next to how much uncertainty it removes — and leaves the decision to her." |
| 1:02 | Open **"How the agent planned this"**: tool calls, rejected drafts, the step list. | "Under the hood, Claude works as an agent with tools: it reads the exposure, lists the invoices, prices discount terms, and proposes actions. But code decides which invoices are eligible and computes every number. Every sentence Claude writes is checked — only numbers from the facts, no forecasts, no advice — and a draft that fails goes back to be rewritten." |
| 1:18 | Back to the card's "Written by Claude, checked by code". | "Nothing runs in PayPal without her click." |

## 1:25–1:45 — Where it sits (AG Grid)

| Time | Screen | Narration |
|---|---|---|
| 1:25 | Step **Where it sits**: heat table, then the **AG Grid** list. | "Here's every open invoice, ranked by what it puts at risk, with what the agent is doing about each one." |
| 1:33 | Type "GBP" in the search box — total row updates. Click **Download CSV**. | "She can search, sort, filter, and download it for her accountant." |

## 1:45–2:05 — Evidence, not forecasts

| Time | Screen | Narration |
|---|---|---|
| 1:45 | Step **Evidence**: the two-year chart. | "Why waiting matters: over the last two years of ECB rates, the longer money waited, the wider the range it moved." |
| 1:55 | The replay paragraph "[narrows by 42%]". | "Replayed over that history, her open invoices paid the way the agent proposes would have moved in a range about [42] percent narrower. History — not a prediction." |

## 2:05–2:30 — Before the next invoice

| Time | Screen | Narration |
|---|---|---|
| 2:05 | Step **Next invoice**: type "Bill Sakura Games ¥480,000 for the level art pack, net 45" → **Read my request and compare**. | "Before she sends the next invoice, she can just describe it." |
| 2:13 | The four option cards (as asked / bill in USD / 14-day terms / half up front) and Claude's comparison. | "Claude turns it into an invoice, and the app compares her options using this client's own payment history: bill in yen, in dollars, on shorter terms, or half up front." |
| 2:23 | Click **Approve: create and send** on one option → "Sent … to Sakura Games". | "She picks one, and it's created and sent in PayPal." |

## 2:30–2:50 — Hand it over

| Time | Screen | Narration |
|---|---|---|
| 2:30 | Step **Autopilot**: tick reminders, discounts up to 1%, **Approve this standing policy**, then **Run autopilot now** → "Reminder sent … autopilot". | "And for the routine work, she approves a standing policy once. Every weekday morning the agent runs what fits it — and anything outside it still waits for her." |
| 2:42 | Back to **Today**. | "Know what exchange rates can take from your unpaid invoices — and shrink it in one click." |
| 2:47 | End card: name, live URL, "PayPal Invoicing API · webhooks · invoice templates · Claude". | (silence or the line above) |

---

## Before recording (checklist)

1. On the live site, enter the access code, then **Today → Sandbox controls → Reset the demo book**. Wait until the agent's
   plan appears (about 30 s). Open each step once so everything is cached.
2. Autopilot must be **off** at the start (the reset turns it off).
3. Browser at 1440×900, zoom 100–110%, light mode, no bookmarks bar, no other tabs visible.
4. Record the screen in one take per section; cut in editing. Keep the cursor slow.
5. No music, or royalty-free music you have the right to use (Official Rules forbid unlicensed music and third-party
   marks). PayPal is named as the platform used, not as an endorsement.
6. English narration (or English captions). Captions are recommended either way.
7. Upload to YouTube as **Public**; put the link in the Devpost form.
