// Access code for the public demo. The hosted site is open to anyone with the link, but anything that
// writes to the PayPal sandbox or calls the model on demand (approve, autopilot, new invoices, simulated
// payments, the model-written invoice comparison) needs the code from the Devpost testing instructions.
// Without FXA_ACCESS_CODE set (local development) everything is open.

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ACCESS_COOKIE = "fxa_access";
const digest = (s: string) => createHash("sha256").update(`fxa-access:${s}`).digest();

export const accessRequired = () => !!process.env.FXA_ACCESS_CODE;

export function codeMatches(code: string): boolean {
  const want = process.env.FXA_ACCESS_CODE;
  return !want || timingSafeEqual(digest(code.trim()), digest(want));
}

// The cookie holds the digest, never the code.
export const cookieValue = (code: string) => digest(code.trim()).toString("hex");

export async function writesAllowed(): Promise<boolean> {
  const want = process.env.FXA_ACCESS_CODE;
  if (!want) return true;
  const got = (await cookies()).get(ACCESS_COOKIE)?.value ?? "";
  const a = Buffer.from(got, "hex");
  const b = digest(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const LOCKED_MESSAGE = "Enter the access code at the top of the page to run actions on the sandbox.";
