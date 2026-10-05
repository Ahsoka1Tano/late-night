// Optional browser checks. The site itself still has no build or dependencies.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const KEY = 'lateNight.journal';
const DAY = '2026-10-5';
const ROOT = path.resolve(__dirname, '..');
const files = new Map([
  ['/', ['index.html', 'text/html']],
  ['/app.js', ['app.js', 'text/javascript']],
  ['/style.css', ['style.css', 'text/css']],
  ['/tapes.json', ['tapes.json', 'application/json']],
  ['/moon.svg', ['moon.svg', 'image/svg+xml']],
]);
let server, browser, origin;

before(async () => {
  server = http.createServer(async (req, res) => {
    const file = files.get(new URL(req.url, 'http://localhost').pathname);
    if (!file) return res.writeHead(404).end();
    try {
      res.writeHead(200, { 'Content-Type': file[1] });
      res.end(await fs.readFile(path.join(ROOT, file[0])));
    } catch {
      res.writeHead(500).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function openRoom(t, entries = {}, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', timezoneId: 'Europe/Moscow' });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no uncaught errors in the room'));
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  await page.clock.install({ time: new Date('2026-10-05T20:00:00+03:00') });
  await page.goto(origin);
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: KEY, value: typeof entries === 'string' ? entries : JSON.stringify(entries),
  });
  await page.reload();
  return page;
}

async function entries(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
}

test('typing then choosing an emotion preserves the entire fresh note on reload', async t => {
  const page = await openRoom(t, { [DAY]: { note: 'old note', day: 'quiet' } });
  await page.locator('#journal-note').fill('Fresh words, just typed.');
  await page.locator('[data-day="good"]').click();
  assert.equal(await page.locator('#journal-note').inputValue(), 'Fresh words, just typed.');
  await page.reload();
  assert.equal(await page.locator('#journal-note').inputValue(), 'Fresh words, just typed.');
  assert.equal(await page.locator('[data-day="good"]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual((await entries(page))[DAY], { note: 'Fresh words, just typed.', day: 'good' });
});

test('immediate reload keeps a full-length multiline note', async t => {
  const page = await openRoom(t);
  const note = 'A quiet night.\n' + 'x'.repeat(125);
  assert.equal(note.length, 140);
  await page.locator('#journal-note').fill(note);
  await page.reload();
  assert.equal(await page.locator('#journal-note').inputValue(), note);
  assert.equal(await page.locator('#journal-count').textContent(), '140 / 140');
});

test('clearing the note keeps its emotion; clearing both leaves other nights alone', async t => {
  const past = { note: 'Leave this intact.', day: 'normal' };
  const page = await openRoom(t, { '2026-10-4': past, [DAY]: { note: 'erase me', day: 'quiet' } });
  await page.locator('#journal-note').fill('');
  await page.reload();
  assert.equal(await page.locator('#journal-note').inputValue(), '');
  assert.equal(await page.locator('[data-day="quiet"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-day="quiet"]').click();
  assert.deepEqual(await entries(page), { '2026-10-4': past });
});

test('failed writes keep the draft visible and retry successfully on blur', async t => {
  const page = await openRoom(t, { [DAY]: { note: 'saved earlier', day: null } });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.rejectJournalWrites = true;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'lateNight.journal' && window.rejectJournalWrites) throw new Error('quota');
      return original.call(this, key, value);
    };
  });
  await page.locator('#journal-note').fill('Keep this draft.');
  await page.locator('[data-day="tired"]').click();
  assert.equal(await page.locator('#journal-note').inputValue(), 'Keep this draft.');
  assert.match(await page.locator('#journal-kept').textContent(), /couldn't save/);
  assert.equal((await entries(page))[DAY].note, 'saved earlier');
  await page.evaluate(() => { window.rejectJournalWrites = false; });
  await page.locator('#journal-note').focus();
  await page.locator('#journal-note').blur();
  assert.deepEqual((await entries(page))[DAY], { note: 'Keep this draft.', day: 'tired' });
  assert.equal(await page.locator('#journal-kept').textContent(), 'saved on this device');
});

test('unreadable stored data is preserved rather than overwritten', async t => {
  for (const raw of ['{broken json', '[]', 'null']) {
    const page = await openRoom(t, raw);
    await page.locator('#journal-note').fill('Still in the editor.');
    assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), raw);
    assert.match(await page.locator('#journal-kept').textContent(), /couldn't save/);
  }
});

test('returning after midnight opens a new evening and preserves the previous note', async t => {
  const page = await openRoom(t);
  await page.locator('#journal-note').fill('Before midnight.');
  await page.clock.setSystemTime(new Date('2026-10-06T00:05:00+03:00'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  assert.equal(await page.locator('#journal-note').inputValue(), '');
  await page.locator('#journal-note').fill('After midnight.');
  const saved = await entries(page);
  assert.equal(saved[DAY].note, 'Before midnight.');
  assert.equal(saved['2026-10-6'].note, 'After midnight.');
});

test('a long note wraps within a 320px phone viewport', async t => {
  const page = await openRoom(t, {}, { width: 320, height: 740 });
  await page.locator('#journal-note').fill('A very quiet evening. '.repeat(6));
  const sizes = await page.locator('#journal-note').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
  assert.ok(sizes.scroll <= sizes.width + 1, 'note wraps without horizontal scrolling');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page fits the phone');
});
