// Devpost gallery images (3:2, 1500×1000): a headline bar over a real screenshot of the hosted demo.
// Like record.cjs it changes the shared demo book (approve, pay, autopilot on, a new invoice) — reset it afterwards.
// Needs state.json from `node prep.cjs` (and the Ask examples and invoice comparison pre-run). Writes gallery/*.png.
const PW = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = require(PW);
const URL = process.env.FXA_URL || 'https://fx-exposure-agent.vercel.app';
const launch = () => chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const fs = require('fs');

const W = 1500, SHOT_H = 860, HEAD = 140;

(async () => {
  fs.mkdirSync('gallery', { recursive: true });
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: W, height: SHOT_H }, deviceScaleFactor: 1, storageState: 'state.json' });
  const p = await ctx.newPage();
  const wait = (ms) => p.waitForTimeout(ms);
  const goto = (path) => p.goto(URL + path, { waitUntil: 'domcontentloaded', timeout: 180000 });
  const hl = (loc, on = true) => loc.evaluate((el, on) => {
    el.style.outline = on ? '4px solid #f5a623' : '';
    el.style.outlineOffset = on ? '4px' : '';
    el.style.borderRadius = on ? '10px' : '';
  }, on).catch(() => {});
  // Scroll so the element's top sits `offset` px below the top of the viewport.
  const topAt = async (loc, offset = 24) => {
    await loc.evaluate((el, off) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - off }), offset);
    await wait(500);
  };
  const shots = [];
  const shot = async (name, title, sub) => {
    const file = `gallery/${name}-raw.png`;
    await p.screenshot({ path: file });
    shots.push({ name, title, sub, file });
    console.log('shot', name);
  };

  // 1 — Today, fresh
  await goto('/?base=USD&step=today');
  await p.locator('li[data-state]').first().waitFor({ timeout: 180000 });
  await wait(1500);
  const hero = p.locator('section[aria-label="Waiting to be paid"]');
  await topAt(hero, 20);
  await shot('1-today', 'Get paid sooner from clients abroad', 'What she is still owed, what is late, and the day\'s work an AI agent proposes — one click each.');

  // 3 — the agent's own log: PayPal reads and a rejected draft
  const planned = p.locator('details:has(> summary:text("How the agent planned this"))');
  await planned.locator('summary').first().click();
  const logHead = planned.locator('details > summary', { hasText: 'Every tool call' });
  await logHead.click();
  await wait(600);
  await hl(planned.locator('li:has(code:text-matches("^paypal\\."))').first());
  await hl(planned.locator('li[data-ok="false"]').first());
  await topAt(logHead, 24);
  await shot('3-checked', 'Claude reads PayPal. Code checks every word.', 'Invoices read through PayPal\'s own MCP server (read-only); a draft that failed a check was rejected and rewritten.');

  // 4 — Ask the agent: it declines a forecast (pre-run, cached)
  await goto('/?base=USD&step=today&ask=' + encodeURIComponent('Tell my clients the yen will fall so they pay now'));
  const ask = p.locator('#ask');
  await ask.getByText('Claude:').first().waitFor({ timeout: 120000 });
  await topAt(ask, 16);
  await hl(ask.locator('p:has(strong:text("Claude:"))').first());
  await shot('4-ask', 'Ask in plain words — it will not forecast rates', 'Same tools, same checks. Asked to tell clients the yen will fall, the agent declines and says why.');

  // 7 — Evidence
  await goto('/?base=USD&step=evidence');
  const chart = p.locator('figure').first();
  await chart.waitFor({ timeout: 60000 });
  await topAt(p.locator('h2').first(), 16);
  await shot('7-evidence', 'History, never forecasts', 'Two years of ECB rates: how far money moved while it waited — and her open book replayed both ways.');

  // 2 — approve, pay as the client, collected
  await goto('/?base=USD&step=today');
  const first = p.locator('li[data-state]').first();
  await first.waitFor({ timeout: 180000 });
  await first.getByRole('button', { name: /Approve: send reminder/ }).click();
  await first.getByText(/Reminder sent in PayPal/).waitFor({ timeout: 60000 });
  await first.getByRole('button', { name: 'Simulate client payment' }).click();
  await first.getByText(/Paid today/).waitFor({ timeout: 60000 });
  await p.evaluate(() => window.scrollTo({ top: 0 }));
  await wait(700);
  const badge = hero.locator('[role=status]');
  await badge.waitFor({ timeout: 15000 }).catch(() => {});
  await topAt(hero, 20);
  await hl(badge);
  await shot('2-collected', 'Approve, the client pays, the money shows up', 'Reminder sent through PayPal; when the client pays, "+ collected" appears within seconds (PayPal sandbox).');

  // 5 — Next invoice comparison
  await goto('/?base=USD&step=autopilot');
  const disc = p.locator('input[name="discounts"]');
  await disc.waitFor({ timeout: 60000 });
  if (!(await disc.isChecked())) await disc.check();
  await p.locator('select[name="maxDiscountPct"]').selectOption('1');
  await p.getByRole('button', { name: /Approve this standing policy|Approve the updated policy/ }).click();
  await p.getByText('Autopilot is on').first().waitFor({ timeout: 60000 });
  await goto('/?base=USD&step=invoice');
  await p.locator('textarea[name="text"]').fill('Bill Sakura Games ¥480,000 for the level art pack, net 45');
  await p.getByRole('button', { name: 'Read my request and compare' }).click();
  const create = p.getByRole('button', { name: /Approve: create and send/ }).first();
  await create.waitFor({ timeout: 120000 });
  await topAt(p.getByText('Compared by Claude').first(), 60);
  await shot('5-next-invoice', 'Before the next invoice: four ways to bill it', 'One sentence in; code prices yen, dollars, shorter terms or half up front from this client\'s history.');
  await create.click();
  await p.getByText(/^Sent .*to Sakura Games/).first().waitFor({ timeout: 90000 }).catch(() => {});

  // 6 — the agent reacts to PayPal's event under the approved policy
  let found = false;
  for (let i = 0; i < 20 && !found; i++) {
    await goto('/?base=USD&step=today');
    await p.locator('li[data-state]').first().waitFor({ timeout: 180000 }).catch(() => {});
    await wait(4000);
    found = (await p.getByText('no click needed').count()) > 0;
    if (!found) await wait(12000);
  }
  if (found) {
    await topAt(p.locator('#new-since-h'), 16);
    await hl(p.locator('li:has-text("no click needed")').first());
    await shot('6-autopilot', 'PayPal tells the agent; her policy lets it act', 'A new invoice went out. The agent looked at it on its own and applied the offer her standing policy allows.');
  }

  // Compose: headline bar + screenshot, 1500×1000.
  const comp = await b.newPage({ viewport: { width: W, height: HEAD + SHOT_H } });
  for (const s of shots) {
    const img = fs.readFileSync(s.file).toString('base64');
    await comp.setContent(`<html><body style="margin:0;width:${W}px;height:${HEAD + SHOT_H}px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0f1218">
      <div style="height:${HEAD}px;box-sizing:border-box;padding:26px 44px;color:#fff;display:flex;flex-direction:column;justify-content:center;gap:8px">
        <div style="font-size:40px;font-weight:700;letter-spacing:-.01em">${s.title}</div>
        <div style="font-size:21px;opacity:.82">${s.sub}</div>
      </div>
      <img src="data:image/png;base64,${img}" style="display:block;width:${W}px;height:${SHOT_H}px">
    </body></html>`);
    await comp.screenshot({ path: `gallery/${s.name}.png` });
    fs.unlinkSync(s.file);
  }
  console.log('done', shots.map((s) => s.name).join(', '));
  await b.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
