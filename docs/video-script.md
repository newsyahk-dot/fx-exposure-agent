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

## 0:30–0:42 — Who it's for and why it matters

| Time | Screen | Narration |
|---|---|---|
| 0:30 | Slow scroll back to the top of Today; hold on "Up or down — equally likely. The size of the risk, not a forecast." | "People who bill abroad wait weeks to be paid, and the exchange rate decides what they actually earn. Banks hedge this for big companies. This app never predicts rates — it shows what's at stake and helps her shorten the wait." |

## 0:42–1:02 — How the agent decides (technical, AI)

| Time | Screen | Narration |
|---|---|---|
| 0:42 | Card **"Offer 1% off to be paid within 10 days · Sakura Games · ¥760,000"**: cost [$48], typical swing [±$164 → ±$68]. | "For a large invoice due in two months, it can offer a small discount — cost next to the uncertainty it removes. She decides." |
| 0:50 | Open **"How the agent planned this"**: "It read [3] invoices directly in PayPal through PayPal's own MCP server…", the step list with `paypal.get_invoice` and rejected drafts. | "Claude works as an agent with tools. It reads her invoices straight from PayPal through PayPal's MCP server. Code decides every number, every sentence is checked, and a draft that fails is rewritten." |

## 1:02–1:22 — Ask the agent (new)

| Time | Screen | Narration |
|---|---|---|
| 1:02 | Today → **Ask the agent** → click the example **"Chase everyone more than 10 days late, gently"** (cut the wait in editing). Claude's answer appears with two reminder cards. | "She can also just tell it what she wants." |
| 1:10 | Highlight the answer: *"…Hollis & Grey and Atelier Moreau… Sakura Games is only 8 days overdue, so I left it alone."* | "It does exactly that — and says what it left alone, and why." |
| 1:15 | Click **"Tell my clients the yen will fall so they pay now"**. Answer: *"I can't tell your clients which way any exchange rate is headed, so I didn't write that message…"* | "Ask it to make a forecast, and it says no." |

## 1:22–1:46 — Where it sits, and why waiting matters

| Time | Screen | Narration |
|---|---|---|
| 1:22 | Step **Where it sits**: the **AG Grid** list; type "GBP" in the search box — the total row updates. | "Every open invoice, ranked by what it puts at risk — searchable, and ready to download for her accountant." |
| 1:34 | Step **Evidence**: the two-year chart, then "[narrows by 42%]". | "Over two years of ECB rates, the longer money waited, the wider it moved. Paid the way the agent proposes, her book would have moved in a range about [42] percent narrower. History — not a prediction." |

## 1:46–2:35 — Hand it over, and the agent acts on its own (new)

| Time | Screen | Narration |
|---|---|---|
| 1:46 | Step **Autopilot**: the four-step picture; tick discounts up to 1%; **Approve this standing policy** → "Autopilot is on". | "For routine work, she approves a standing policy once. Anything outside it still waits for her click." |
| 1:56 | Step **Next invoice**: click the example **"Bill Sakura Games ¥480,000 …, net 45"** → **Read my request and compare** → the four options and Claude's comparison. | "Before the next invoice, she describes it. The app compares billing in yen, in dollars, on shorter terms or half up front, using this client's payment history." |
| 2:10 | **Approve: create and send** on "As asked" → "Sent … to Sakura Games". | "She sends it in PayPal." |
| 2:15 | Cut (about a minute later, shown with an on-screen clock or a "1 minute later" caption) → **Today** → **New since today's plan**: *"✓ PayPal told the agent about FXA-N… · Sakura Games; the autopilot applied an early-payment discount at … — no click needed."* | "PayPal tells the agent a new invoice went out. It looks at it on its own — and because her policy covers it, the discount is already applied. Nobody pressed anything." |

## 2:35–2:52 — Close

| Time | Screen | Narration |
|---|---|---|
| 2:35 | Back to the top of **Today**; caption: "48 test runs · 283 proposals · 0 rule breaks in the final output". | "Every number from code, every action approved — by her click or her policy." |
| 2:44 | End card: name, live URL, "PayPal Invoicing API · webhooks · invoice templates · PayPal MCP server · Claude". | "Know what exchange rates can take from your unpaid invoices — and shrink it in one click." |

---

## Before recording (checklist)

1. On the live site, enter the access code, then **Today → Sandbox controls → Reset the demo book**. Wait until the agent's
   plan appears (about a minute — it reads the invoices in PayPal). Open each step once so everything is cached.
2. Autopilot must be **off** at the start (the reset turns it off); the 1:46 scene turns it on.
3. Before recording, click both **Ask the agent** examples once (each takes 15–30 s the first time; afterwards the answer is
   cached for hours and appears at once). Do this on the same day as the recording.
4. The new-invoice scene (2:15) needs the policy on **before** the invoice is sent, and about 60–90 seconds for PayPal's
   webhook and the agent. Keep recording or cut; refresh Today if the section has not appeared after two minutes.
5. To record a section again, reset the demo book — but the reset button waits 5 minutes after the last reset.
6. Browser at 1440×900, zoom 100–110%, light mode, no bookmarks bar, no other tabs visible.
7. Record the screen in one take per section; cut in editing. Keep the cursor slow.
8. No music, or royalty-free music you have the right to use (Official Rules forbid unlicensed music and third-party
   marks). PayPal is named as the platform used, not as an endorsement.
9. English narration (or English captions). Captions are recommended either way.
10. Upload to YouTube as **Public**; put the link in the Devpost form.
