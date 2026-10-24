// The model-written comparison, cached by everything it depends on: asking for the same invoice again
// (or reloading) does not call the model twice. Same shared store as the agent plan.

import { cacheLife } from "next/cache";
import { writeComparison, type ClientHistory, type Comparison, type InvoiceOption, type InvoiceRequest } from "./invoice-plan";

export async function cachedComparison(req: InvoiceRequest, h: ClientHistory, options: InvoiceOption[], base: string): Promise<Comparison> {
  "use cache: remote";
  cacheLife("days");
  return writeComparison(req, h, options, base, true);
}
