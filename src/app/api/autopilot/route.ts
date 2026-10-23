// Scheduled autopilot run (Vercel Cron, see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`;
// without that secret configured the route refuses every call, so the public site cannot trigger it.

import { demoMode } from "@/lib/book";
import { runAutopilot } from "@/lib/autopilot";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  if (demoMode()) return Response.json({ ran: false, reason: "demo mode" });
  try {
    return Response.json(await runAutopilot());
  } catch (e) {
    return Response.json({ ran: false, reason: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
