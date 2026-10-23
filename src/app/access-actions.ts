"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { ACCESS_COOKIE, codeMatches, cookieValue } from "@/lib/access";

export type UnlockState = { ok: boolean; message: string } | null;

export async function unlock(_prev: UnlockState, form: FormData): Promise<UnlockState> {
  const code = String(form.get("code") ?? "");
  if (!code.trim() || !codeMatches(code)) return { ok: false, message: "That code is not right." };
  (await cookies()).set(ACCESS_COOKIE, cookieValue(code), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 14 * 86_400,
  });
  refresh();
  return { ok: true, message: "Unlocked. Actions now run on the PayPal sandbox." };
}
