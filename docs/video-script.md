# Demo video — script and shot list (target 2:30, hard limit 3:00)

Judges score five things equally: technical implementation, design, potential impact, innovation, presentation
("does the video show it working end to end; what problem, for whom, why it matters"). The first 30 seconds must run the
whole loop once. Everything shown must work exactly as shown (Official Rules: "must function as depicted in the video").

Six beats, **one number per beat**. The story is getting paid sooner; exchange rates are why it matters, not the headline.
Numbers on screen change with the day's ECB rates — read them from the screen while recording; [brackets] are placeholders.
Captions are mandatory (burned in).

---

## 1 · 0:00–0:30 — Paid, once (Today)

| Time | Screen | Narration | Number |
|---|---|---|---|
| 0:00 | **Today**, USD. Hero: "[$31K] waiting to be paid from clients abroad", chip "[$6,799] overdue · 3 invoices". | "Maya is a freelance designer in the US. Her clients in Europe, the UK and Japan pay her through PayPal invoices. Right now about [$31,000] is still owed to her — and some of it is already late." | $31K |
| 0:10 | First card: **"Chase a late payment · Hollis & Grey · Overdue 15 days · [$2,807] waiting"**. Click **Approve: send reminder** → "✓ Reminder sent in PayPal". | "Every morning an AI agent goes through her invoices and proposes the day's work. One click, and the reminder goes out through PayPal." | — |
| 0:18 | Same card: **Open as client ↗** → pay on PayPal's page with the sandbox buyer → back to the app (cut the wait). Card → **"✓ Paid today — [$2,807] collected"**; hero counts down and shows **"+[$2,807] collected"**; bar slice turns green. | "When the client pays, PayPal tells the app — and it shows up within seconds." | +$2,807 |

> The webhook was verified on 2026-10-26 ("Paid" in under 20 s after paying on PayPal's page). Log in to the sandbox
> buyer in that browser before recording. Fallback if PayPal's page misbehaves: "Simulate client payment".

## 2 · 0:30–0:45 — Why it matters

| Time | Screen | Narration | Number |
|---|---|---|---|
| 0:30 | Hold on the hero chip "±[$929] if rates move 3% before it arrives" and the line "up or down, equally likely — the size of the risk, not a forecast". | "Waiting costs more than patience. Until foreign money arrives, the exchange rate decides what she actually earns. A 3% move either way is about [$929] on what she's owed. Banks hedge this for big companies. The app never predicts rates — it helps her get paid sooner." | ±$929 |

## 3 · 0:45–1:10 — The agent, checked by code

| Time | Screen | Narration | Number |
|---|---|---|---|
| 0:45 | Card **"Offer 1% off · Sakura Games · Asks for payment by Nov 5 instead of Dec 23 — about 7 weeks sooner — for 1% off ([$48])"**. | "For a large invoice due in two months, it can offer a small early-payment discount. The cost is shown next to how much it shortens the wait. She decides." | 7 weeks |
| 0:55 | Zoom on the badge **"✓ Written by Claude, checked by code · 1 draft rejected (forecast or advice wording) and rewritten"**; open **"How the agent planned this"** to the `paypal.get_invoice` steps. | "Claude reads her invoices straight from PayPal through PayPal's MCP server. Code decides every number and checks every sentence. This draft broke a rule, so it was sent back and rewritten before she ever saw it." | 1 rejected |

## 4 · 1:10–1:30 — Ask in plain words

| Time | Screen | Narration | Number |
|---|---|---|---|
| 1:10 | **Ask the agent** → "Chase everyone more than 10 days late, gently" → answer with two reminder cards; highlight "*…Sakura Games is only 8 days overdue, so I left it alone.*" | "She can just say what she wants. It does it — and says what it left alone, and why." | — |
| 1:20 | "Tell my clients the yen will fall so they pay now" → "*I can't tell your clients which way any exchange rate is headed…*" | "Ask it to forecast, and it says no." | — |

## 5 · 1:30–2:10 — Hand it over

| Time | Screen | Narration | Number |
|---|---|---|---|
| 1:30 | **Autopilot**: tick discounts up to 1% → **Approve this standing policy** → "Autopilot is on". | "For routine work, she approves a policy once. Anything outside it still waits for her click." | 1% |
| 1:40 | **Next invoice**: example "Bill Sakura Games ¥480,000 …, net 45" → compare → **Approve: create and send** → "Sent". | "She describes the next invoice in a sentence and sends it in PayPal." | — |
| 1:52 | Caption "about a minute later" → **Today → New since today's plan**: "*✓ PayPal told the agent about FXA-N… the autopilot applied an early-payment discount … no click needed.*" | "PayPal tells the agent a new invoice went out. It looks at it on its own — and because her policy covers it, the offer is already on the invoice." | — |

## 6 · 2:10–2:30 — Close

| Time | Screen | Narration | Number |
|---|---|---|---|
| 2:10 | Back to the top of **Today**; caption: "48 test runs · 283 proposals · 0 violations of our own checks". (Optional 2-second flash of **Evidence**: the replay line, e.g. "about two-thirds as wide".) | "Every number from code. Every action approved — by her click, or her policy." | 0 |
| 2:20 | End card: name, live URL, "PayPal Invoicing API · webhooks · invoice templates · PayPal MCP server · Claude". | "Get paid sooner from clients abroad." | — |

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
