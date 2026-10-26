// Where the money at risk this morning stands now, by what has happened to each invoice today. Feeds the bar on
// the Today screen. Amounts are the ±3% stress figure in the home currency. Approving an action does not remove
// risk — only a payment does — so "sent" and "proposed" are still at risk; "paid" is what left the book today.

export type BarKey = "paid" | "sent" | "proposed" | "none";
export type BarSegment = { key: BarKey; value: number; count: number };

export function todayBar(
  atRisk: { id: string; shock: number }[], // open foreign-currency invoices, now
  states: Record<string, "sent" | "proposed">, // invoice id -> what the agent's plan did with it today
  paid: { shock: number; count: number }, // foreign-currency payments that arrived today
): { segments: BarSegment[]; morning: number; now: number } {
  const seg = (key: BarKey): BarSegment => ({ key, value: 0, count: 0 });
  const by = { paid: seg("paid"), sent: seg("sent"), proposed: seg("proposed"), none: seg("none") };
  by.paid.value = Math.max(0, paid.shock);
  by.paid.count = paid.count;
  for (const i of atRisk) {
    const s = by[states[i.id] ?? "none"];
    s.value += Math.max(0, i.shock);
    s.count++;
  }
  const now = by.sent.value + by.proposed.value + by.none.value;
  return { segments: [by.paid, by.sent, by.proposed, by.none], morning: now + by.paid.value, now };
}
