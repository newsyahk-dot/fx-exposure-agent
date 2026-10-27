// Starts the shared demo book over with the "Reset the demo book" button (needs the saved unlocked session).
const PW = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = require(PW);
const URL = process.env.FXA_URL || 'https://fx-exposure-agent.vercel.app';
const launch = () => chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
(async () => {
  const b = await launch();
  const ctx = await b.newContext({ storageState: 'state.json' });
  const p = await ctx.newPage();
  await p.goto(URL + '/?base=USD&step=today', { waitUntil: 'domcontentloaded', timeout: 180000 });
  await p.locator('summary:has-text("Sandbox controls")').click();
  const btn = p.getByRole('button', { name: /Reset the demo book/ }).first();
  await btn.click();
  const msg = p.locator('[role=status], [role=alert]').filter({ hasText: /reset|Reset|shared|failed/ }).first();
  await msg.waitFor({ timeout: 180000 });
  console.log(new Date().toISOString(), await msg.innerText());
  await b.close();
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
