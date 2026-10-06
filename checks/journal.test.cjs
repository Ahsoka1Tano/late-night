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
  ['/assets/night-express.svg', ['assets/night-express.svg', 'image/svg+xml']],
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
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.journal')).opacity) > 0.5);
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
  await openHistory(page);
  assert.equal(await page.locator('.journal-entry-note').textContent(), 'Before midnight.');
});

test('a long note wraps within a 320px phone viewport', async t => {
  const page = await openRoom(t, {}, { width: 320, height: 740 });
  await page.locator('#journal-note').fill('A very quiet evening. '.repeat(6));
  const sizes = await page.locator('#journal-note').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
  assert.ok(sizes.scroll <= sizes.width + 1, 'note wraps without horizontal scrolling');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page fits the phone');
});

async function openHistory(page) {
  await page.locator('#journal-history summary').click();
  await page.waitForFunction(() => document.getElementById('journal-history-note').textContent.length > 0);
}

test('history orders legacy date keys chronologically and includes emotion-only evenings', async t => {
  const page = await openRoom(t, {
    '2026-9-30': { note: 'September.', day: null },
    '2026-10-2': { note: 'October.', day: 'normal' },
    '2026-1-10': { note: 'January.', day: null },
    '2026-10-4': { note: '', day: 'quiet' },
    [DAY]: { note: 'Tonight is still in the editor.', day: 'good' },
    '2026-10-6': { note: 'Not a past night.', day: null },
    '2026-2-30': { note: 'Invalid date.', day: null },
    'not-a-date': { note: 'Ignore this.', day: null },
    '2026-10-3': { note: 42, day: 'unknown' },
    '2026-10-1': null,
  });
  await page.locator('#journal-history summary').focus();
  await page.locator('#journal-history summary').press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.journal-entry').length === 4);
  assert.deepEqual(await page.locator('.journal-entry time').evaluateAll(nodes => nodes.map(node => node.dateTime)),
    ['2026-10-04', '2026-10-02', '2026-09-30', '2026-01-10']);
  assert.match(await page.locator('.journal-entry-mood').first().textContent(), /quiet/);
  assert.equal(await page.locator('#journal-note').inputValue(), 'Tonight is still in the editor.');
});

test('history pages through older evenings and moves keyboard focus to the new entries', async t => {
  const saved = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`2026-9-${i + 1}`, { note: `Night ${i + 1}`, day: null }]));
  const page = await openRoom(t, saved);
  await openHistory(page);
  assert.equal(await page.locator('.journal-entry').count(), 7);
  await page.locator('#journal-older').click();
  assert.equal(await page.locator('.journal-entry').count(), 10);
  assert.equal(await page.locator('#journal-older').isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement.querySelector('time').dateTime), '2026-09-03');
  await page.locator('#journal-history summary').click();
  await openHistory(page);
  await page.waitForFunction(() => document.querySelectorAll('.journal-entry').length === 7);
  assert.deepEqual(await entries(page), saved, 'browsing does not modify stored notes');
});

test('empty and unreadable history give different messages and recover on reopening', async t => {
  const page = await openRoom(t);
  await openHistory(page);
  assert.match(await page.locator('#journal-history-note').textContent(), /Past notes will appear/);
  await page.locator('#journal-history summary').click();
  await page.evaluate(key => localStorage.setItem(key, '{invalid'), KEY);
  await openHistory(page);
  await page.waitForFunction(() => document.getElementById('journal-history-note').textContent.includes("couldn't"));
  assert.equal(await page.locator('.journal-entry').count(), 0);
  await page.locator('#journal-history summary').click();
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ '2026-10-4': { note: 'Recovered.' } })), KEY);
  await openHistory(page);
  await page.locator('.journal-entry-note').waitFor();
  assert.equal(await page.locator('.journal-entry-note').textContent(), 'Recovered.');
});

test('history renders note text safely and fits mobile and desktop layouts', async t => {
  const note = '<img src=x onerror="window.journalInjected=true">\n' + 'x'.repeat(90);
  const saved = {
    '2026-10-4': { note, day: 'quiet' },
    '2026-10-2': { note: 'Rain on the window.\nFinished one small thing.', day: 'productive' },
    '2026-9-30': { note: '', day: 'tired' },
  };
  for (const width of [320, 1280]) {
    const page = await openRoom(t, saved, { width, height: 900 });
    await openHistory(page);
    assert.equal(await page.locator('.journal-entry-note').first().textContent(), note);
    assert.equal(await page.locator('.journal-entry img').count(), 0);
    assert.equal(await page.evaluate(() => window.journalInjected), undefined);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.JOURNAL_PREVIEW_DIR) {
      await page.locator('#journal-history summary').click();
      await page.evaluate(key => {
        const saved = JSON.parse(localStorage.getItem(key));
        saved['2026-10-4'].note = 'A cup of tea, rain outside.\nLeft tomorrow for tomorrow.';
        localStorage.setItem(key, JSON.stringify(saved));
      }, KEY);
      await openHistory(page);
      await page.locator('.journal').screenshot({ animations: 'disabled', path: path.join(process.env.JOURNAL_PREVIEW_DIR, `journal-${width}.png`) });
    }
  }
});

test('Space opens history in Focus mood without starting the timer', async t => {
  const page = await openRoom(t, { '2026-10-4': { note: 'A quiet night.' } });
  await page.locator('[data-mood="focus"]').click();
  await page.locator('#journal-history summary').focus();
  await page.locator('#journal-history summary').press('Space');
  await page.locator('.journal-entry').waitFor();
  assert.equal(await page.locator('#focus-toggle').textContent(), 'start');
  assert.equal(await page.locator('#hint').isVisible(), false);
  await page.locator('#journal-history summary').press('Space');
  await page.waitForFunction(() => !document.body.classList.contains('is-reading-journal'));
  assert.equal(await page.locator('#hint').isVisible(), true);
});

test('a storage read failure at midnight does not move an unsaved draft to the wrong day', async t => {
  const page = await openRoom(t, { [DAY]: { note: 'Original evening.', day: 'quiet' } });
  await page.evaluate(() => {
    const original = Storage.prototype.getItem;
    window.rejectJournalReads = true;
    Storage.prototype.getItem = function (key) {
      if (key === 'lateNight.journal' && window.rejectJournalReads) throw new Error('unavailable');
      return original.call(this, key);
    };
  });
  await page.clock.setSystemTime(new Date('2026-10-06T00:05:00+03:00'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.locator('#journal-note').fill('Draft still belongs to the fifth.');
  await page.evaluate(() => {
    window.rejectJournalReads = false;
    window.dispatchEvent(new Event('focus'));
  });
  assert.equal((await entries(page))[DAY].note, 'Draft still belongs to the fifth.');
  assert.equal(await page.locator('#journal-note').inputValue(), '');
});
