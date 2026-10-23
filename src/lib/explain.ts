// One or two plain-English sentences per proposal, written by Claude — and checked before they reach
// the screen.
//
// The model only rewords facts we computed. Two deterministic gates decide whether its sentence is
// shown; if either fails, a fixed template sentence is shown instead and the reason is kept:
//   1. every number in the sentence must appear in the facts we gave it (no invented figures)
//   2. no forecast or advice language (this app never says which way rates go or what to pick)
// With no API key, everything falls back to the template — the page never depends on the model.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { krwCompact, money } from "./format";
import type { Proposal } from "./proposals";

export type Explanation = { text: string; source: "claude" | "template"; reason?: string };
export type ProposalFacts = { key: string; kind: Proposal["kind"]; facts: string; template: string };

export const EXPLAIN_MODEL = process.env.FXA_EXPLAIN_MODEL || "claude-haiku-5-5";
// Server-side refusal fallback exists only on some models; Haiku 5.5 has none, so only send it where it applies.
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);
const SHOCK_PCT = 3;

export const proposalKey = (p: Proposal) => `${p.kind}:${p.invoiceId}`;

// The facts the model may use, written the way the screen writes them.
export function factsFor(p: Proposal): ProposalFacts {
  const shock = krwCompact((p.krw * SHOCK_PCT) / 100);
  if (p.kind === "reminder") {
    const facts = [
      `Invoice ${p.invoiceNumber}: ${money(p.currency, p.amount)} still owed, worth about ${krwCompact(p.krw)}.`,
      `It is ${p.daysOverdue} days overdue.`,
      `A ${SHOCK_PCT}% stress-test move in the won, either way, changes its won value by about ${shock}.`,
      p.lastReminderAt ? `A reminder was already sent on ${p.lastReminderAt.slice(0, 10)}.` : `No reminder has been sent by this app yet.`,
      `Action: send the client a PayPal payment reminder.`,
    ].join(" ");
    const template = `${money(p.currency, p.amount)} is ${p.daysOverdue} days late; until it is paid, its won value moves with the rate — about ${shock} for a ${SHOCK_PCT}% move either way.`;
    return { key: proposalKey(p), kind: p.kind, facts, template };
  }
  const now = p.swingNowKrw == null ? null : krwCompact(p.swingNowKrw);
  const early = p.swingIfEarlyKrw == null ? null : krwCompact(p.swingIfEarlyKrw);
  const facts = [
    `Invoice ${p.invoiceNumber}: ${money(p.currency, p.amount)}, worth about ${krwCompact(p.krw)}, due in ${p.daysToDue} days.`,
    `Action: give the client ${p.discountPct}% off and move the due date to ${p.discountWithinDays} days from today.`,
    `The discount costs about ${krwCompact(p.costKrw)}.`,
    now && early
      ? `A typical swing either way (one standard deviation) in the won value until the due date is about ${now}; if paid within ${p.discountWithinDays} days it is about ${early}.`
      : `There is not enough rate history to size the swing.`,
    `The discount stays even if the client pays late (PayPal sandbox limitation).`,
  ].join(" ");
  const template =
    now && early
      ? `${p.discountPct}% off costs about ${krwCompact(p.costKrw)}; if the client pays within ${p.discountWithinDays} days, the typical won swing on this invoice shrinks from about ${now} to ${early}.`
      : `${p.discountPct}% off costs about ${krwCompact(p.costKrw)} and moves the due date to ${p.discountWithinDays} days out.`;
  return { key: proposalKey(p), kind: p.kind, facts, template };
}

// --- Gates ---------------------------------------------------------------------------------------

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
const numbersIn = (s: string) => new Set((s.match(NUMBER) ?? []).map((n) => Number(n.replace(/,/g, ""))));

// Forecasts and advice. The app shows costs and swings; the user decides.
const FORBIDDEN = new RegExp(
  [
    String.raw`\bwill\s+(?:likely\s+)?(?:rise|fall|drop|climb|weaken|strengthen|appreciate|depreciate|go\s+up|go\s+down|move)`,
    String.raw`\b(?:likely|expected|set|poised)\s+to\b`,
    String.raw`\b(?:forecast|predict|outlook|bullish|bearish)`,
    String.raw`\b(?:should|recommend|suggest|advise|best\s+(?:option|choice)|better\s+(?:option|choice|off)|worth\s+it|no-brainer)\b`,
  ].join("|"),
  "i",
);

export function gate(text: string, facts: string): string | null {
  if (!text.trim()) return "empty";
  if (text.length > 400) return "too long";
  const allowed = numbersIn(facts);
  const unknown = [...numbersIn(text)].filter((n) => !allowed.has(n));
  if (unknown.length) return `numbers not in the facts: ${unknown.join(", ")}`;
  const bad = FORBIDDEN.exec(text);
  if (bad) return `forecast or advice wording: "${bad[0]}"`;
  return null;
}

// --- Model call ------------------------------------------------------------------------------------

const SYSTEM = `You write one or two short sentences for each proposed action in an FX exposure app for solo sellers paid in foreign currency through PayPal.

Rules:
- Use only the facts given for that action. Every number you write must appear in its facts, written the same way.
- Explain what the action changes for the seller's exposure to exchange rates, in plain English for a non-specialist.
- Never say or imply which way any exchange rate will move. Two different sizes appear in the facts: the 3% figure is a stress-test move either way, and the one-standard-deviation figure is a typical swing either way. Keep them distinct, and present neither as a loss.
- Never recommend, advise or rank. Do not say the action is worth it, better, or what the seller should do. The seller decides.
- At most two sentences per action. No greetings, no markdown, no lists.`;

const Output = z.object({ items: z.array(z.object({ key: z.string(), text: z.string() })) });

export async function explain(facts: ProposalFacts[]): Promise<Record<string, Explanation>> {
  const out: Record<string, Explanation> = {};
  const fallbackAll = (reason: string) => {
    for (const f of facts) out[f.key] = { text: f.template, source: "template", reason };
    return out;
  };
  if (facts.length === 0) return out;
  const apiKey = process.env.FXA_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallbackAll("no API key");

  // Pin the host: the SDK otherwise picks up ANTHROPIC_BASE_URL, which Claude Code environments set for
  // their own routing — the app's key must only ever go to the Anthropic API.
  const client = new Anthropic({ apiKey, baseURL: "https://api.anthropic.com", timeout: 45_000, maxRetries: 1 });
  let parsed: z.infer<typeof Output> | null = null;
  try {
    const res = await client.beta.messages.parse({
      model: EXPLAIN_MODEL,
      max_tokens: 8000,
      ...(FALLBACK_MODELS.has(EXPLAIN_MODEL)
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
      output_config: { effort: "low", format: betaZodOutputFormat(Output) },
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(facts.map(({ key, kind, facts }) => ({ key, kind, facts }))) }],
    });
    if (process.env.FXA_EXPLAIN_DEBUG) console.error(`[explain] ${res.model} stop=${res.stop_reason} usage=${JSON.stringify(res.usage)}`);
    if (res.stop_reason === "refusal") return fallbackAll("model declined");
    parsed = res.parsed_output ?? null;
  } catch (e) {
    return fallbackAll(e instanceof Anthropic.APIError ? `API error ${e.status ?? ""}`.trim() : "API call failed");
  }
  if (!parsed) return fallbackAll("unreadable model output");


  const byKey = new Map(parsed.items.map((i) => [i.key, i.text.trim()]));
  for (const f of facts) {
    const text = byKey.get(f.key);
    const why = text == null ? "missing from model output" : gate(text, f.facts);
    out[f.key] = why ? { text: f.template, source: "template", reason: why } : { text: text!, source: "claude" };
  }
  return out;
}
