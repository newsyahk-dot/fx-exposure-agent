// Deterministic checks on every piece of text the model writes, before it reaches the screen or a client.
//
//   1. Numbers: every number in the text must appear in the facts we gave the model for that item.
//   2. Seller-facing text: no forecast or advice — the app never says which way rates go or what to pick.
//   3. Client-facing text (reminder e-mails, invoice notes): the same, plus no links, no new offers in a
//      reminder, and a length limit.
// A check returns null when the text passes, or a short reason the agent can act on.

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
export const numbersIn = (s: string) => new Set((s.match(NUMBER) ?? []).map((n) => Number(n.replace(/,/g, ""))));

const FORECAST_OR_ADVICE = new RegExp(
  [
    String.raw`\bwill\s+(?:likely\s+)?(?:rise|fall|drop|climb|weaken|strengthen|appreciate|depreciate|go\s+up|go\s+down|move)`,
    String.raw`\b(?:likely|expected|set|poised)\s+to\b`,
    String.raw`\b(?:forecast|predict|outlook|bullish|bearish)`,
    String.raw`\b(?:should|recommend|suggest|advise|best\s+(?:option|choice)|better\s+(?:option|choice|off)|worth\s+it|no-brainer)\b`,
  ].join("|"),
  "i",
);

// Broken-off or self-correcting text ("about ¥8,274... no") is not shown to anyone.
function shapeCheck(text: string): string | null {
  const t = text.trim();
  if (/\.\.\.|…/.test(t)) return "contains an ellipsis or a broken-off sentence";
  if (!/[.!?)"]$/.test(t)) return "does not end as a complete sentence";
  return null;
}

function numbersCheck(text: string, facts: string): string | null {
  const allowed = numbersIn(facts);
  const unknown = [...numbersIn(text)].filter((n) => !allowed.has(n));
  return unknown.length ? `numbers not in the facts: ${unknown.join(", ")}` : null;
}

function wordingCheck(text: string): string | null {
  const bad = FORECAST_OR_ADVICE.exec(text);
  return bad ? `forecast or advice wording: "${bad[0]}"` : null;
}

// A one-standard-deviation swing is a size of uncertainty, not money gained, and an applied discount is
// a cost whether or not the client pays early. Wording that treats either otherwise is rejected.
const MISFRAMED = /\bpays?\s+for\s+itself\b|\bcovers?\s+its\s+(?:own\s+)?cost\b|\bbenefits?\b|\b(?:a\s+)?cost\s+only\b|\bonly\s+(?:a\s+)?cost\b|\bcosts?\s+nothing\b|\bsaves?\b|\bsavings?\b/i;

const MONEY = String.raw`[$€£¥₩]-?[\d,]+(?:\.\d+)?[KMB]?`;
const NEAR = String.raw`(?:(?!\.\s)[^$€£¥₩;]){0,70}`;
const SWING_LABEL = new RegExp(String.raw`(?:typical\s+swing|standard\s+deviation|1σ)${NEAR}(${MONEY})`, "gi");
const STRESS_LABEL = new RegExp(String.raw`(?:\d+%\s+(?:stress[- ]test\s+)?move|stress[- ]test(?:\s+move)?)${NEAR}(${MONEY})`, "gi");

export type LabelContext = {
  stress: string[]; // the 3% stress-test figures, as shown
  swings: string[]; // the one-standard-deviation figures (now, if early, reduction), as shown; empty for reminders
  others: string[]; // other invoices' numbers and other clients' names: a reason is about its own invoice
};

// Figures must carry the label they were computed under: a 3% stress figure called a "typical swing" (or
// the reverse) is a different claim. Checks the first figure after each label.
function labelCheck(text: string, ctx: LabelContext): string | null {
  for (const m of text.matchAll(SWING_LABEL)) {
    if (!ctx.swings.length) return `calls ${m[1]} a typical swing, but there is no swing figure here (the 3% figure is a stress-test move)`;
    if (!ctx.swings.includes(m[1]) && ctx.stress.includes(m[1])) return `calls ${m[1]} a typical swing, but it is the 3% stress-test figure`;
  }
  for (const m of text.matchAll(STRESS_LABEL))
    if (!ctx.stress.includes(m[1]) && ctx.swings.includes(m[1])) return `calls ${m[1]} a stress-test move, but it is a typical-swing figure`;
  const other = ctx.others.find((o) => o && text.includes(o));
  if (other) return `mentions ${other}; keep each reason about its own invoice`;
  return null;
}

// Text that is not a reason ("Placeholder not used.") or that narrates the agent's own tool calls ("I logged a stray
// skip by mistake; please disregard it") instead of telling the seller what was done. Both reached the screen once
// (2026-10-27); the seller should only ever read about invoices.
const PLACEHOLDER = /\b(?:placeholder|lorem ipsum|tbd|todo|to be decided)\b/i;
const MECHANICS = /\b(?:skip record|stray|by mistake|my mistake|disregard|tool calls?|logged an?\b)/i;

function substanceCheck(text: string): string | null {
  const p = PLACEHOLDER.exec(text);
  if (p) return `placeholder text instead of a reason: "${p[0]}"`;
  if (text.trim().split(/\s+/).length < 4) return "too short to be a reason the seller can read";
  const m = MECHANICS.exec(text);
  return m ? `talks about the agent's own steps ("${m[0]}"); say what was done for the seller` : null;
}

// Seller-facing: rationales, summaries, reasons for skipping.
export function checkSellerText(text: string, facts: string, maxLen = 450, ctx?: LabelContext): string | null {
  if (!text.trim()) return "empty";
  if (text.length > maxLen) return `too long (${text.length} > ${maxLen} characters)`;
  const mis = MISFRAMED.exec(text);
  return (
    shapeCheck(text) ??
    substanceCheck(text) ??
    numbersCheck(text, facts) ??
    wordingCheck(text) ??
    (mis ? `treats a swing or a discount as money gained or saved: "${mis[0]}"` : null) ??
    (ctx ? labelCheck(text, ctx) : null)
  );
}

// Client-facing: reminder e-mails and the note added to a discounted invoice.
// A discount applied by editing the invoice is unconditional; a note must not promise otherwise.
const CONDITIONAL = /\bif\b[^.]{0,60}\bpa(?:y|id|yment)\b|\bprovided (?:that|you)\b|\bas long as\b|\bon condition\b|\bonly when\b/i;

export function checkClientText(
  text: string,
  facts: string,
  o: { maxLen: number; allowOffer: boolean; unconditional?: boolean },
): string | null {
  if (!text.trim()) return "empty";
  if (text.length > o.maxLen) return `too long (${text.length} > ${o.maxLen} characters)`;
  if (/https?:\/\/|www\./i.test(text)) return "contains a link (PayPal adds the payment link itself)";
  if (/\.\.\.|…/.test(text)) return "contains an ellipsis or a broken-off sentence";
  if (!o.allowOffer && /discount|%|\boff\b|waive/i.test(text)) return "offers a discount in a reminder (not approved)";
  if (o.unconditional && CONDITIONAL.test(text))
    return "makes the discount conditional, but it is applied now and stays even if the client pays late";
  return numbersCheck(text, facts) ?? wordingCheck(text);
}
