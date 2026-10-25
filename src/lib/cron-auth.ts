// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without the secret configured every call is refused,
// so the public site cannot trigger scheduled work.
export const cronAuthorized = (req: Request) => {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
};
