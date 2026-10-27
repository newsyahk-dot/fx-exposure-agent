// Before recording: unlocks the hosted demo with FXA_ACCESS_CODE (saved as state.json, git-ignored) and runs the
// requests the video uses once, so they are cached and appear at once on camera.
const PW = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = require(PW);
const URL = process.env.FXA_URL || 'https://fx-exposure-agent.vercel.app';
const launch = () => chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const code = process.env.FXA_ACCESS_CODE;
  if (!code) throw new Error('Set FXA_ACCESS_CODE (the hosted demo access code). It is never stored in this repo.');
  await p.goto(URL + '/?base=USD&step=today', { waitUntil: 'domcontentloaded' });
  let ok = (await p.getByText('actions unlocked').count()) > 0;
  if (!ok) {
    await p.locator('input[name="code"]').fill(code);
    await p.locator('form:has(input[name="code"]) button[type=submit]').click();
    await p.waitForTimeout(4000);
    await p.reload({ waitUntil: 'domcontentloaded' });
    ok = (await p.getByText('actions unlocked').count()) > 0;
  }
  console.log('unlocked:', ok);
  if (!ok) process.exit(1);
  await ctx.storageState({ path: 'state.json' });
  if (process.argv.includes('--unlock-only')) return b.close();
  // Pre-run the two Ask examples so they are cached for the recording.
  for (const q of ['Chase everyone more than 10 days late, gently', 'Tell my clients the yen will fall so they pay now']) {
    const t = Date.now();
    await p.goto(URL + '/?base=USD&step=today&ask=' + encodeURIComponent(q), { waitUntil: 'networkidle', timeout: 180000 }).catch(e => console.log('ask err', e.message));
    console.log('ask', q.slice(0, 20), Math.round((Date.now() - t) / 1000) + 's');
  }
  // Pre-run the invoice comparison (cached per request).
  await p.goto(URL + '/?base=USD&step=invoice', { waitUntil: 'networkidle' });
  await p.locator('textarea[name="text"]').fill('Bill Sakura Games ¥480,000 for the level art pack, net 45');
  const t = Date.now();
  await p.getByRole('button', { name: 'Read my request and compare' }).click();
  await p.getByRole('button', { name: /Approve: create and send/ }).first().waitFor({ timeout: 120000 }).catch(e => console.log('compare err', e.message));
  console.log('compare', Math.round((Date.now() - t) / 1000) + 's');
  await b.close();
})();
