// Records the demo video draft on the live site, following docs/video-script.md.
// Captions and a visible cursor are drawn into the page; waits are marked and cut afterwards (cut.json).
const PW = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = require(PW);
const URL = process.env.FXA_URL || 'https://fx-exposure-agent.vercel.app';
const launch = () => chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const fs = require('fs');
const W = 1440, H = 900;

const INIT = `(() => {
  const css = \`
    #__cap{position:fixed;left:50%;bottom:34px;transform:translateX(-50%);max-width:1100px;z-index:2147483647;
      background:rgba(15,18,24,.86);color:#fff;font:600 26px/1.38 system-ui,-apple-system,Segoe UI,sans-serif;
      padding:14px 26px;border-radius:14px;text-align:center;opacity:0;transition:opacity .25s;pointer-events:none;
      box-shadow:0 6px 30px rgba(0,0,0,.25)}
    #__cap small{display:block;font-weight:500;font-size:17px;opacity:.82;margin-top:4px}
    #__cur{position:fixed;width:22px;height:22px;margin:-3px 0 0 -3px;z-index:2147483647;pointer-events:none;
      background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22'><path d='M2 2 L2 18 L7 13 L10.5 20 L13 19 L9.6 12 L16.5 12 Z' fill='black' stroke='white' stroke-width='1.5'/></svg>") no-repeat}
    .__ripple{position:fixed;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;border:3px solid #2a78d6;
      z-index:2147483646;pointer-events:none;animation:__r .6s ease-out forwards}
    @keyframes __r{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}
    .__hl{outline:4px solid #f5a623 !important;outline-offset:4px !important;border-radius:10px;transition:outline-color .3s}
  \`;
  const ensure = () => {
    if (!document.body) return;
    if (!document.getElementById('__st')) { const s=document.createElement('style'); s.id='__st'; s.textContent=css; document.head.appendChild(s); }
    if (!document.getElementById('__cap')) {
      const c=document.createElement('div'); c.id='__cap'; document.body.appendChild(c);
      const t=sessionStorage.getItem('__cap'); if (t) { c.innerHTML=t; c.style.opacity=1; }
    }
    if (!document.getElementById('__cur')) {
      const k=document.createElement('div'); k.id='__cur'; document.body.appendChild(k);
      const p=(sessionStorage.getItem('__cur')||'720,450').split(','); k.style.left=p[0]+'px'; k.style.top=p[1]+'px';
    }
  };
  const mark = () => {
    if (!document.body) return;
    let m = document.getElementById('__mark');
    const c = sessionStorage.getItem('__mark') || '';
    if (!m) { m = document.createElement('div'); m.id = '__mark'; document.body.appendChild(m); }
    m.style.cssText = 'position:fixed;left:0;top:0;width:24px;height:24px;z-index:2147483647;pointer-events:none;background:' + (c || 'transparent');
  };
  window.__setMark = (c) => { sessionStorage.setItem('__mark', c || ''); mark(); };
  setInterval(() => { ensure(); mark(); }, 100);
  setInterval(ensure, 200);
  document.addEventListener('DOMContentLoaded', ensure);
  window.__setCap = (html) => { ensure(); const c=document.getElementById('__cap'); sessionStorage.setItem('__cap', html||''); c.innerHTML=html||''; c.style.opacity=html?1:0; };
  addEventListener('mousemove', e => { const k=document.getElementById('__cur'); if(k){k.style.left=e.clientX+'px';k.style.top=e.clientY+'px';} sessionStorage.setItem('__cur', e.clientX+','+e.clientY); }, true);
  addEventListener('mousedown', e => { const r=document.createElement('div'); r.className='__ripple'; r.style.left=e.clientX+'px'; r.style.top=e.clientY+'px'; document.body.appendChild(r); setTimeout(()=>r.remove(),700); }, true);
})();`;

(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: W, height: H }, storageState: 'state.json', recordVideo: { dir: 'raw', size: { width: W, height: H } } });
  await ctx.addInitScript(INIT);
  const p = await ctx.newPage();
  const t0 = Date.now();
  await p.setContent('<html><body style="margin:0;background:#0f1218;height:100vh"></body></html>');
  const now = () => (Date.now() - t0) / 1000;
  const cuts = []; let cutAt = null;
  // Pages made with setContent (title cards) have no init script, so draw the square directly there.
  const setMark = (c) => p.evaluate((c) => {
    if (window.__setMark) return window.__setMark(c);
    let m = document.getElementById('__mark');
    if (!m) { m = document.createElement('div'); m.id = '__mark'; document.body.appendChild(m); }
    m.style.cssText = 'position:fixed;left:0;top:0;width:24px;height:24px;z-index:2147483647;background:' + (c || 'transparent');
  }, c).catch(() => {});
  const cutBegin = async () => { cutAt = now(); await setMark('#ff00ff'); await p.waitForTimeout(250); };
  const cutEnd = async () => { await setMark('#00ffff'); await p.waitForTimeout(350); await setMark(''); await p.waitForTimeout(150); cuts.push([cutAt, now()]); cutAt = null; };
  const log = (...a) => console.log(now().toFixed(1), ...a);
  const wait = (ms) => p.waitForTimeout(ms);
  const say = async (text, sub, ms) => {
    const html = text ? text + (sub ? `<small>${sub}</small>` : '') : '';
    await p.evaluate((h) => window.__setCap && window.__setCap(h), html).catch(() => {});
    const words = (text + ' ' + (sub || '')).split(/\s+/).length;
    await wait(ms ?? Math.max(2500, words * 330 + 900));
  };
  const hl = (loc, on = true) => loc.evaluate((el, on) => el.classList.toggle('__hl', on), on).catch(() => {});
  const show = async (loc, block = 'center') => { await loc.evaluate((el, block) => el.scrollIntoView({ behavior: 'smooth', block }), block); await wait(900); };
  const moveTo = async (loc) => { const bb = await loc.boundingBox(); if (bb) await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 25 }); await wait(250); };
  const click = async (loc) => { await moveTo(loc); await loc.click(); };
  const clear = () => p.evaluate(() => window.__setCap && window.__setCap('')).catch(() => {});
  const goto = async (path) => { await clear(); await p.goto(URL + path, { waitUntil: 'domcontentloaded', timeout: 180000 }); };
  const navTo = async (label) => { await clear(); await click(p.locator('nav[aria-label="Steps"] a', { hasText: label })); };

  // ---- Opening — the problem, from a public source (README "Why it matters")
  await p.setContent(`<html><body style="margin:0;height:100vh;display:grid;place-items:center;background:#0f1218;color:#fff;font-family:system-ui,-apple-system,Segoe UI,sans-serif">
    <div style="text-align:center;max-width:1050px">
      <div style="font-size:52px;font-weight:700;letter-spacing:-.02em;line-height:1.2">35% of UK freelancers were not paid on time by a client in the past year.</div>
      <div style="font-size:22px;margin-top:20px;opacity:.6">IPSE, late payment research, 2022</div>
      <div style="font-size:30px;margin-top:44px;opacity:.92">When the client is abroad, the exchange rate keeps moving while she waits.</div>
    </div></body></html>`);
  await wait(4800);

  // ---- Scene 1 — paid, once
  await cutBegin();
  await goto('/?base=USD&step=today');
  const hero = p.locator('section[aria-label="Waiting to be paid"]');
  // A reminder on money from abroad (late home-currency invoices are chased too, but they are not this story).
  const firstCard = p.locator('li[data-state]:has-text("Chase a late payment")').filter({ hasNotText: /· USD / }).first();
  await firstCard.waitFor({ timeout: 180000 });
  await wait(1500);
  await cutEnd();
  const heroText = await hero.innerText();
  const total = (heroText.match(/\$[\d.,]+K/) || ['about $31K'])[0];
  const overdue = ((await hero.locator('[data-tone="late"]').innerText().catch(() => '')).match(/\$[\d,]+/) || ['some'])[0];
  log('hero', total, overdue);
  await say('Maya is a freelance designer in the US.', 'Her clients in Europe, the UK and Japan pay her through PayPal invoices.');
  await hl(hero);
  await say(`Right now ${total.replace('K', ',000').replace(/\$(\d+),000/, '$$$1,000')} is still owed to her —`, `and ${overdue} of it is already late.`);
  await hl(hero, false);
  await show(firstCard, 'start');
  await p.mouse.wheel(0, -120); await wait(500);
  await say('Every morning an AI agent goes through her invoices and proposes the day\'s work.', null);
  const approve = firstCard.getByRole('button', { name: /Approve: send reminder/ });
  await show(approve);
  await say('One click, and the reminder goes out through PayPal.', null, 1800);
  await click(approve);
  await cutBegin();
  await firstCard.getByText(/Reminder sent in PayPal/).waitFor({ timeout: 60000 });
  await cutEnd();
  await show(firstCard.getByText(/Reminder sent in PayPal/));
  await say('✓ Sent in PayPal.', 'Now play the client and pay the invoice.', 2600);
  const pay = firstCard.getByRole('button', { name: 'Simulate client payment' });
  await click(pay);
  await say('Paying as the client…', 'Sandbox: payment simulated in the app. Paying on PayPal\'s own invoice page shows up the same way, via webhook, in under 20 s.', 1500);
  await firstCard.getByText(/Paid today/).waitFor({ timeout: 60000 }).catch(() => log('paid text not seen'));
  const collected = ((await firstCard.innerText()).match(/(\$[\d,]+) collected/) || [, ''])[1];
  log('collected', collected);
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await wait(800);
  const badge = hero.locator('[role=status]');
  await badge.waitFor({ timeout: 15000 }).catch(() => log('badge not seen'));
  await hl(badge);
  await say(`Paid: ${collected || 'the payment'} collected.`, 'What she is still waiting for goes down at once.', 3400);
  await hl(badge, false);

  // ---- Scene 2 — why it matters
  const shockChip = hero.getByText(/if rates move/);
  const shock = ((await shockChip.innerText()).match(/±\$[\d,]+/) || ['±$900'])[0];
  await hl(shockChip);
  await say(`Until foreign money arrives, the rate decides what she earns: a 3% move is about ${shock}.`, 'Up or down, equally likely — the size of the risk, never a forecast.');
  await hl(shockChip, false);
  await say('Banks hedge this for big companies.', 'This app never predicts rates — it helps a one-person business get paid sooner.', 3600);
  const timeline = p.locator('figure:has-text("When the money comes in")').first();
  if (await timeline.count()) {
    await show(timeline);
    const cap = (await timeline.locator('figcaption').innerText()).replace(/^When the money comes in\s*—\s*/, '');
    await hl(timeline);
    await say('When the money comes in, week by week.', cap ? cap.charAt(0).toUpperCase() + cap.slice(1) + ' — a scenario, not a promise.' : 'As invoiced, and if clients pay as proposed — a scenario, not a promise.', 6000);
    await hl(timeline, false);
  }

  // ---- Scene 3 — the agent, checked by code
  const offer = p.locator('li[data-state]:has-text("sooner, for")').first();
  await show(offer);
  const pitch = offer.locator('p').nth(2);
  await hl(offer);
  const annual = ((await offer.innerText()).match(/about ([\d.]+)% a year/) || [, ''])[1];
  await say('For an invoice due in two months, it can ask to be paid weeks sooner for a small discount.', `A price for getting paid sooner${annual ? ` — about ${annual}% a year here` : ''}. Code allows only offers at least 3 weeks sooner and at most 12% a year. She decides.`, 6500);
  const approveOffer = offer.getByRole('button', { name: /^Approve: offer/ });
  await show(approveOffer);
  await click(approveOffer);
  await cutBegin();
  await offer.getByText(/Offer sent in PayPal/).waitFor({ timeout: 90000 }).catch(() => log('offer sent not seen'));
  await wait(800);
  await cutEnd();
  const sentNote = offer.locator('p', { hasText: /is unchanged/ }).first();
  if (await sentNote.count()) {
    await show(sentNote);
    await hl(sentNote);
    await say('The client gets a separate early-payment invoice for the lower amount.', 'Her own invoice stays exactly as it is — if the client does not pay early, the offer simply lapses.', 5600);
    await hl(sentNote, false);
  }
  await hl(offer, false);
  const badgeCheck = offer.getByText(/Written by Claude, checked by code/);
  await hl(badgeCheck);
  await wait(400);
  await hl(badgeCheck, false);
  const planned = p.locator('details:has(> summary:text("How the agent planned this"))');
  await show(planned.locator('summary').first());
  await click(planned.locator('summary').first());
  await wait(600);
  const toolLog = planned.locator('details > summary', { hasText: 'Every tool call' });
  if (await toolLog.count()) { await show(toolLog); await click(toolLog); await wait(500); }
  const firstRead = planned.locator('li:has(code:text-matches("^paypal\\\\."))').first();
  if (await firstRead.count()) { await show(firstRead); await hl(firstRead); }
  await say('Claude reads her invoices from PayPal\'s own MCP server (read-only). Code decides every number and checks every sentence;', 'a draft that fails is sent back and rewritten before she sees it.', 6500);
  if (await firstRead.count()) await hl(firstRead, false);

  // ---- Scene 4 — ask in plain words
  const ask = p.locator('#ask');
  await show(ask, 'start');
  await say('She can also just say what she wants.', null, 2200);
  await click(ask.getByRole('button', { name: 'Chase everyone more than 10 days late, gently' }));
  await cutBegin();
  await ask.getByText('Claude:').first().waitFor({ timeout: 120000 });
  await wait(800);
  await cutEnd();
  const answer = ask.locator('p:has(strong:text("Claude:"))').first();
  await show(answer);
  await hl(answer);
  await say('It does it — and says what it left alone, and why. Ask it to forecast a currency, and it declines.', null, 6000);
  await hl(answer, false);
  // ---- Scene 4b — every invoice in one AG Grid; approve the late ones together
  await clear();
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await wait(600);
  await navTo('Where it sits');
  const grid = p.locator('.ag-root').first();
  await cutBegin();
  await grid.waitFor({ timeout: 120000 });
  await wait(1200);
  await cutEnd();
  await show(grid, 'start');
  await p.mouse.wheel(0, -170); await wait(500);
  await say('Every invoice in one grid: what is at risk, what the agent is doing, how each client usually pays.', null, 4200);
  const lateView = p.getByRole('button', { name: /^Late/ });
  if (await lateView.count()) { await click(lateView); await wait(700); }
  const boxes = p.locator('.ag-row:not(.ag-row-pinned) .ag-selection-checkbox input:visible');
  const nBoxes = await boxes.count();
  for (let i = 0; i < nBoxes; i++) { await moveTo(boxes.nth(i)); await boxes.nth(i).check({ force: true }); await wait(250); }
  const approveSel = p.getByRole('button', { name: /^Approve selected/ });
  if (await approveSel.count()) {
    await say('She ticks the late ones the agent wants to chase —', null, 2200);
    await click(approveSel);
    await wait(500);
    const panel = p.locator('[aria-label="Approve from the grid"]');
    await hl(panel);
    await say('checks exactly what will run, and approves them together.', 'Each one goes through the same checks as a single approval.', 3800);
    await hl(panel, false);
    await click(p.getByRole('button', { name: /^Confirm: approve/ }));
    await cutBegin();
    await p.waitForFunction(() => !/Running in PayPal/.test(document.body.innerText), null, { timeout: 120000 }).catch(() => {});
    // Wait until the grid itself shows the reminders as sent (the page refreshes after the approvals).
    await p.waitForFunction(() => !/Reminder proposed/.test(document.querySelector('.ag-root')?.textContent ?? ''), null, { timeout: 30000 }).catch(() => {});
    await wait(800);
    await cutEnd();
    await hl(panel);
    await say('✓ Sent in PayPal.', null, 2200);
    await hl(panel, false);
  }
  const allView = p.getByRole('button', { name: /^All/ });
  if (await allView.count()) { await click(allView); await wait(500); }

  // ---- Scene 5 — hand it over
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await wait(700);
  await clear();
  await wait(1500); // let the grid's refresh after the approvals settle
  await goto('/?base=USD&step=autopilot');
  const disc = p.locator('input[name="discounts"]');
  await disc.waitFor({ timeout: 60000 });
  await wait(800);
  await show(disc);
  await say('For routine work, she approves a standing policy once.', 'Reminders yes; early-payment discounts up to 1%.', 3000);
  if (!(await disc.isChecked())) await click(disc);
  await p.locator('select[name="maxDiscountPct"]').selectOption('1');
  const approvePolicy = p.getByRole('button', { name: /Approve this standing policy|Approve the updated policy/ });
  await click(approvePolicy);
  await cutBegin();
  await p.getByText('Autopilot is on').first().waitFor({ timeout: 60000 });
  await cutEnd();
  await show(p.getByText('Autopilot is on').first());
  await say('Autopilot is on.', 'Anything outside the policy still waits for her click.', 2400);
  const runNow = p.getByRole('button', { name: 'Run autopilot now' });
  await show(runNow);
  await click(runNow);
  await cutBegin();
  const ran = p.locator('[role=status]:has-text("Autopilot ran")').first();
  await ran.waitFor({ timeout: 180000 }).catch(() => log('autopilot result not seen'));
  await wait(600);
  await cutEnd();
  if (await ran.count()) {
    await show(ran);
    await hl(ran);
    await say('It runs what her policy covers, through the same checks — and says what it left for her.', null, 4200);
    await hl(ran, false);
  }

  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await wait(700);
  await navTo('Next invoice');
  const textBox = p.locator('textarea[name="text"]');
  await textBox.waitFor({ timeout: 60000 });
  await wait(600);
  await say('Next, she describes a new invoice in one sentence.', null, 1800);
  await click(p.getByRole('button', { name: /^Bill Sakura Games ¥480,000/ }));
  await wait(600);
  await click(p.getByRole('button', { name: 'Read my request and compare' }));
  await cutBegin();
  const create = p.getByRole('button', { name: /Approve: create and send/ }).first();
  await create.waitFor({ timeout: 120000 });
  await wait(600);
  await cutEnd();
  const compared = p.getByText('Compared by Claude').first();
  await show(compared, 'start');
  await say('Code prices four ways to bill it, with this client\'s payment history when there is one.', null, 3000);
  await show(create);
  await say('She picks one and approves it.', null, 1800);
  await click(create);
  await cutBegin();
  const sent = p.getByText(/^Sent .*to Sakura Games/).first();
  await sent.waitFor({ timeout: 90000 }).catch(() => log('sent text not seen'));
  await show(sent);
  await cutEnd();
  await hl(sent);
  await say('✓ Created and sent in PayPal.', null, 1800);
  await hl(sent, false);
  await clear();

  // Wait (cut) for PayPal's webhook and the agent's reaction.
  await cutBegin();
  let found = false;
  for (let i = 0; i < 20 && !found; i++) {
    await goto('/?base=USD&step=today');
    await p.locator('li[data-state]').first().waitFor({ timeout: 180000 }).catch(() => {});
    await wait(4000);
    found = (await p.getByText(/the agent looked at (it|them) on its own/).count()) > 0;
    log('poll', i, found);
    if (!found) await wait(12000);
  }
  const notice = p.locator('#new-since-h');
  if (found) { await show(notice, 'start'); }
  await p.evaluate(() => window.__setCap && window.__setCap('About a minute later…'));
  await wait(800);
  await cutEnd();
  await wait(1600);
  if (found) {
    const sect = p.locator('section[aria-labelledby="new-since-h"]');
    await hl(sect);
    await say('PayPal tells the agent a new invoice went out. It looks at it on its own —', 'and leaves the terms she just chose alone: any offer on it waits for her click.', 6500);
    await hl(sect, false);
  }

  // ---- Scene 6 — any seller can try it on their own invoice list
  await goto('/try');
  const loadSample = p.getByRole('button', { name: 'Load a sample' });
  await loadSample.waitFor({ timeout: 60000 });
  await wait(600);
  await say('Any seller can try it on their own invoices: paste a list from PayPal or any invoicing tool.', 'Nothing is stored, and nothing in PayPal is touched.', 4200);
  await click(loadSample);
  await wait(500);
  await click(p.getByRole('button', { name: "Show what's waiting" }));
  await cutBegin();
  const ownHero = p.locator('section[aria-label="Your invoices"]');
  await ownHero.waitFor({ timeout: 90000 });
  await wait(800);
  await cutEnd();
  await show(ownHero, 'start');
  await say('What is waiting, what is late, and the exchange-rate risk — by currency.', null, 3800);
  const ownTimeline = ownHero.locator('figure').first();
  if (await ownTimeline.count()) { await show(ownTimeline); await hl(ownTimeline); await wait(1600); await hl(ownTimeline, false); }
  await cutBegin();
  await goto('/?base=USD&step=today');
  await p.locator('li[data-state]').first().waitFor({ timeout: 180000 }).catch(() => {});
  await wait(800);
  await cutEnd();

  // ---- Scene 7 — close. The total now includes the invoice she just sent, so say so instead of leaving a number
  // that seems to have gone back up.
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await wait(900);
  const evalMd = fs.readFileSync(require('path').join(__dirname, '..', 'agent-eval.md'), 'utf8');
  let runs = 0, props = 0, probs = 0;
  for (const m of evalMd.matchAll(/^\| [^|]+ \| (\d+) \| \d+ \| (\d+) \([^|]*\| [^|]*\| \*\*(\d+)\*\*/gm)) { runs += +m[1]; props += +m[2]; probs += +m[3]; }
  await say(`Tested on ${runs} agent runs · ${props} proposals: every final output re-checked afterwards — ${probs} problems.`, 'Every number from code. Every action approved — by her click, or her policy.', 5200);
  await say('', null, 300);
  // Leave the app first: its 10-second refresh would otherwise replace the end card with an error page.
  await p.goto('about:blank');
  await p.mouse.move(W - 5, H - 5);
  await p.setContent(`<html><body style="margin:0;height:100vh;display:grid;place-items:center;background:#0f1218;color:#fff;font-family:system-ui,-apple-system,Segoe UI,sans-serif">
    <div style="text-align:center">
      <div style="font-size:64px;font-weight:700;letter-spacing:-.02em">FX Exposure Agent</div>
      <div style="font-size:30px;margin-top:18px;opacity:.92">Get paid sooner from clients abroad.</div>
      <div style="font-size:24px;margin-top:34px;color:#7fb2ff">fx-exposure-agent.vercel.app</div>
      <div style="font-size:18px;margin-top:30px;opacity:.7">PayPal Invoicing API · webhooks · invoice templates · PayPal MCP server · Claude</div>
      <div style="font-size:15px;margin-top:14px;opacity:.5">PayPal sandbox — no real money moved</div>
    </div></body></html>`);
  await wait(5500);

  fs.writeFileSync('cuts.json', JSON.stringify({ cuts, end: now() }, null, 1));
  log('done; cuts', JSON.stringify(cuts));
  await ctx.close();
  await b.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
