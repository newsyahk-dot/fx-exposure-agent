# Demo video — script and shot list (target 2:55, hard limit 3:00)

An automated captioned recording of this script: `docs/video/` (see its README).

Judges score five things equally: technical implementation, design, potential impact, innovation, presentation
("does the video show it working end to end; what problem, for whom, why it matters"). The first 30 seconds must run the
whole loop once. Everything shown must work exactly as shown (Official Rules: "must function as depicted in the video").

Seven beats, **one number per beat**. Open on an event (the morning clients abroad are late), and make the first
number money that is late — not a total, and never an exchange-rate gain (lessons from two lost contests, 2026-10-30). The story is getting paid sooner; exchange rates are why it matters, not the headline.
Numbers on screen change with the day's ECB rates — `record.cjs` reads them from the screen while recording; [brackets] are
placeholders. Captions are mandatory (burned in).

---

## 0 · 0:00–0:07 — The problem (title card)

"35% of UK freelancers were not paid on time by a client in the past year" (IPSE, 2022 — README "Why it matters").
"When the client is abroad, the exchange rate keeps moving while she waits."

## 1 · 0:07–0:35 — Paid, once (Today)

| Screen | Narration | Number |
|---|---|---|
| **Today**, USD. "[$31K] waiting to be paid from clients abroad", tiles **Late [$6,779] · [3] clients** · Due in 2 weeks · If rates move 3% · Collected today. | "Monday morning. Maya, a freelance designer in the US, opens her PayPal invoices. [Three] clients abroad are paying late — [$6,779] overdue. In all, [$31,000] is owed to her in euros, pounds and yen — seen the way a treasury desk would: what is late, what comes in when, and what a rate move can do to it." | $6,779 |
| First card: **Chase a late payment** → **Approve: send reminder** → "✓ Reminder sent in PayPal". | "Every morning an AI agent goes through her invoices and proposes the day's work. One click, and the reminder goes out through PayPal." | — |
| Client pays (in the automated take: "Simulate client payment", captioned as simulated; by hand: PayPal's invoice page with the sandbox buyer) → **"+[$2,807] collected"**. | "When the client pays, it shows up within seconds." | +$2,807 |

## 2 · 0:35–1:00 — Why sooner matters

| Screen | Narration | Number |
|---|---|---|
| Hero chip "±[$929] if rates move 3% either way". | "Until foreign money arrives, the exchange rate decides what she actually earns — about [$929] either way on a 3% move. Banks hedge this for big companies. The app never predicts rates; it helps her get paid sooner." | ±$929 |
| **When the money comes in** chart: "within 2 weeks: [$2,016] as invoiced → [$24K] if every client pays as proposed (best case)". | "Week by week: as invoiced, and the best case if every client pays as proposed — not a forecast." | $24K |

## 3 · 1:00–1:25 — The agent, checked by code

| Screen | Narration | Number |
|---|---|---|
| Card **"Ask to be paid [54] days sooner, for 1% off"** · "about [6.4]% a year". | "For an invoice due in two months, it can ask to be paid weeks sooner for a small discount — a price for getting paid sooner, shown as a yearly rate. Code allows only offers at least 3 weeks sooner and at most 12% a year. She decides." | [6.4]% a year |
| **Approve: offer 1% off if paid by [Nov 1]** → "✓ Offer sent" · "Offer [FXA-2005-r33-EP]: [EUR 4,950.00] if paid by [Nov 1]. [FXA-2005-r33] is unchanged". | "The client gets a separate early-payment invoice for the lower amount. Her own invoice stays exactly as it is — if the client does not pay early, the offer simply lapses." | — |
| Badge **"✓ Written by Claude, checked by code · 1 draft rejected … rewritten"**; **How the agent planned this** → `paypal.get_invoice` steps. | "Claude reads her invoices straight from PayPal through PayPal's MCP server. Code decides every number and checks every sentence; a draft that breaks a rule is rewritten before she sees it." | — |

## 4 · 1:25–1:40 — Ask in plain words

"Chase everyone more than 10 days late, gently" → reminders, and what it left alone and why.
(The refusal — "Tell my clients the yen will fall so they pay now" → it declines — is said in the caption and shown in the gallery, to stay under 3:00.)

## 4b · 1:40–2:00 — Every invoice in one AG Grid (fixed 20 s — judges who never open the site see the grid only here)

**Where it sits**: click the heatmap cell **JPY · Overdue** → the invoice grid below narrows to it (chip shown) → **▸**
opens the row: how this client has paid + the agent's draft → **✎ e-mail**, change one word → clear the chip, **Late**
→ tick the rows with a reminder waiting → **Approve selected** → the confirmation lists each action → **Confirm** →
"✓ Reminder sent" for each. "She sees where the money sits, opens one client's history, adjusts the agent's e-mail,
and approves the late ones together — each through the same checks as a single approval."

## 5 · 2:00–2:20 — Before the next invoice

**Next invoice**: "Bill Sakura Games ¥480,000 for the level art pack, net 45" → the comparison: in yen, in dollars,
on shorter terms, half up front — what each leaves riding on exchange rates, from this client's own payment history →
**Approve: create and send**. "Before she sends the next invoice, she sees what each way of billing leaves at risk.
The app never says which to pick."

## 6 · 2:20–2:35 — Hand it over, and try your own

Autopilot: **Approve this standing policy** (reminders) → **Run autopilot now**. Then **/try** → Load a sample →
"Paste your own invoice list; nothing is stored, nothing in PayPal is touched." (Ask-the-agent's refusal and the
PayPal-event reaction stay in the app and the gallery.)

## 7 · 2:35–2:55 — Close

Caption with the numbers from `docs/agent-eval.md` ("[N] agent runs · [M] proposals · [0] violations of our own checks"),
then the end card: name, live URL, "PayPal Invoicing API · webhooks · invoice templates · PayPal MCP server · Claude".
"Before she sends, while she waits, when a client is late — her money from abroad, seen like a treasury desk sees it."

Dropped from the video (still in the app): the Evidence chart in detail, the PayPal-event reaction and the refusal
(gallery only). The Where-it-sits grid is in beat 4b.

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
11. Beat 3 shows a rejected-and-rewritten draft in "How the agent planned this" (the step log); on a card it is inside
    "Numbers and the agent's reason" (2026-10-29: moved off the badge, a review read it as the AI failing). If today's
    plan has none, Re-plan once (access code).
