# Demo video — script and shot list (target 2:55, hard limit 3:00)

An automated captioned recording of this script: `docs/video/` (see its README).

Judges score five things equally: technical implementation, design, potential impact, innovation, presentation
("does the video show it working end to end; what problem, for whom, why it matters"). The first 30 seconds must run the
whole loop once. Everything shown must work exactly as shown (Official Rules: "must function as depicted in the video").

Seven beats, **one number per beat**. The story is getting paid sooner; exchange rates are why it matters, not the headline.
Numbers on screen change with the day's ECB rates — `record.cjs` reads them from the screen while recording; [brackets] are
placeholders. Captions are mandatory (burned in).

---

## 0 · 0:00–0:07 — The problem (title card)

"35% of UK freelancers were not paid on time by a client in the past year" (IPSE, 2022 — README "Why it matters").
"When the client is abroad, the exchange rate keeps moving while she waits."

## 1 · 0:07–0:35 — Paid, once (Today)

| Screen | Narration | Number |
|---|---|---|
| **Today**, USD. Hero: "[$31K] waiting to be paid", chip "[$6,799] overdue". | "Maya is a freelance designer in the US. Her clients in Europe, the UK and Japan pay her through PayPal invoices. Right now about [$31,000] is still owed to her — and some of it is already late." | $31K |
| First card: **Chase a late payment** → **Approve: send reminder** → "✓ Reminder sent in PayPal". | "Every morning an AI agent goes through her invoices and proposes the day's work. One click, and the reminder goes out through PayPal." | — |
| Client pays (in the automated take: "Simulate client payment", captioned as simulated; by hand: PayPal's invoice page with the sandbox buyer) → **"+[$2,807] collected"**. | "When the client pays, it shows up within seconds." | +$2,807 |

## 2 · 0:35–1:00 — Why sooner matters

| Screen | Narration | Number |
|---|---|---|
| Hero chip "±[$929] if rates move 3% either way". | "Until foreign money arrives, the exchange rate decides what she actually earns — about [$929] either way on a 3% move. Banks hedge this for big companies. The app never predicts rates; it helps her get paid sooner." | ±$929 |
| **When the money comes in** chart: "within 2 weeks: [$2,016] as invoiced → [$24K] if clients pay as proposed". | "Week by week: as invoiced, and if clients pay as proposed — a scenario, not a promise." | $24K |

## 3 · 1:00–1:25 — The agent, checked by code

| Screen | Narration | Number |
|---|---|---|
| Card **"Ask to be paid [7] weeks sooner, for 1% off"** · "about [6.4]% a year". | "For an invoice due in two months, it can ask to be paid weeks sooner for a small discount — a price for getting paid sooner, shown as a yearly rate. Code allows only offers at least 3 weeks sooner and at most 12% a year. She decides." | [6.4]% a year |
| **Approve: offer 1% off if paid by [Nov 1]** → "✓ Offer sent" · "Offer [FXA-2005-r33-EP]: [EUR 4,950.00] if paid by [Nov 1]. [FXA-2005-r33] is unchanged". | "The client gets a separate early-payment invoice for the lower amount. Her own invoice stays exactly as it is — if the client does not pay early, the offer simply lapses." | — |
| Badge **"✓ Written by Claude, checked by code · 1 draft rejected … rewritten"**; **How the agent planned this** → `paypal.get_invoice` steps. | "Claude reads her invoices straight from PayPal through PayPal's MCP server. Code decides every number and checks every sentence; a draft that breaks a rule is rewritten before she sees it." | — |

## 4 · 1:25–1:45 — Ask in plain words

"Chase everyone more than 10 days late, gently" → reminders, and what it left alone and why.
(The refusal — "Tell my clients the yen will fall so they pay now" → it declines — is said in the caption and shown in the gallery, to stay under 3:00.)

## 4b · Every invoice in one AG Grid — approve the late ones together

**Where it sits**: the grid ranked by what is at risk, with "Agent today" and how each client usually pays → **Late**
→ tick the rows with a reminder waiting → **Approve selected** → the confirmation lists each action → **Confirm** →
"✓ Reminder sent" for each. "She ticks the late ones the agent wants to chase, checks exactly what will run, and
approves them together — each through the same checks as a single approval."

## 5 · 1:45–2:20 — Hand it over

Autopilot: discounts up to 1% → **Approve this standing policy** → **Run autopilot now** ("Autopilot ran: 3 done", and
what it left for her). Next invoice: "Bill Sakura Games ¥480,000 …, net 45" → compare → **Approve: create and send**.
About a minute later, **New since today's plan**: PayPal told the agent, it looked at the new invoice on its own, and it
leaves the terms she just chose alone — any offer on it waits for her click.

## 6 · 2:20–2:40 — Try it with your own invoices

**/try** → Load a sample → Show what's waiting: what is waiting, what is late, the exchange-rate risk by currency, the
timeline and the plan. "Nothing is stored, and nothing in PayPal is touched."

## 7 · 2:40–2:55 — Close

Caption with the numbers from `docs/agent-eval.md` ("[N] agent runs · [M] proposals · [0] violations of our own checks"),
then the end card: name, live URL, "PayPal Invoicing API · webhooks · invoice templates · PayPal MCP server · Claude".
"Get paid sooner from clients abroad."

Dropped from the video (still in the app): the Where-it-sits grid and the Evidence chart in detail.

---

## Before recording (checklist)

1. On the live site, enter the access code, then **Today → Sandbox controls → Reset the demo book**. Wait until the agent's
   plan appears (about a minute — it reads the invoices in PayPal). Open each step once so everything is cached.
2. Autopilot must be **off** at the start (the reset turns it off); beat 5 turns it on.
3. Before recording, click both **Ask the agent** examples once (each takes 15–30 s the first time; afterwards the answer is
   cached for hours and appears at once). Do this on the same day as the recording.
4. The new-invoice scene (beat 5) needs the policy on **before** the invoice is sent, and about 60–90 seconds for PayPal's
   webhook and the agent. Keep recording or cut; refresh Today if the section has not appeared after two minutes.
5. To record a section again, reset the demo book — but the reset button waits 5 minutes after the last reset.
6. Browser at 1440×900, zoom 100–110%, light mode, no bookmarks bar, no other tabs visible.
7. Record the screen in one take per section; cut in editing. Keep the cursor slow.
8. No music, or royalty-free music you have the right to use (Official Rules forbid unlicensed music and third-party
   marks). PayPal is named as the platform used, not as an endorsement.
9. English narration **and burned-in English captions** — many judges watch muted. One caption line per sentence.
10. Upload to YouTube as **Public**; put the link in the Devpost form.
11. Before beat 3, make sure the first card shows a badge with "draft rejected … and rewritten". If today's plan has
    none on screen, use any card that does, or Re-plan once (access code) and pick one that does.
