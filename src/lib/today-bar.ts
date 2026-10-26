// Where today's money from clients abroad stands, by what has happened to each invoice today. Feeds the bar on the
// Today screen. Amounts are in the home currency. Approving an action does not bring money in — only a payment
// does — so "sent" and "proposed" are still waiting; "paid" is what was collected today.

export type BarKey = "paid" | "sent" | "proposed" | "none";
export type BarSegment = { key: BarKey; value: number; count: number };

export function todayBar(
  waiting: { id: string; value: number }[], // open foreign-currency invoices, now
  states: Record<string, "sent" | "proposed">, // invoice id -> what the agent's plan did with it today
  paid: { value: number; count: number }, // foreign-currency payments that arrived today
): { segments: BarSegment[]; morning: number; now: number } {
  const seg = (key: BarKey): BarSegment => ({ key, value: 0, count: 0 });
  const by = { paid: seg("paid"), sent: seg("sent"), proposed: seg("proposed"), none: seg("none") };
  by.paid.value = Math.max(0, paid.value);
  by.paid.count = paid.count;
  for (const i of waiting) {
    const s = by[states[i.id] ?? "none"];
    s.value += Math.max(0, i.value);
    s.count++;
  }
  const now = by.sent.value + by.proposed.value + by.none.value;
  return { segments: [by.paid, by.sent, by.proposed, by.none], morning: now + by.paid.value, now };
}
