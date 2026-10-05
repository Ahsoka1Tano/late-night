// Optional browser checks. The site itself still has no build or dependencies.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

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


async function openRoom(t, width = 1280, motion = 'reduce') {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: motion });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  // Deterministic media double: remote availability is checked separately.
  await page.addInitScript(() => {
    window.media = [];
    window.Audio = class extends EventTarget {
      constructor(src = '') {
        super(); this.src = src; this.paused = true; this.volume = 1; this.readyState = 4;
        window.media.push(this);
      }
      play() {
        if (window.deferAudio) return new Promise((resolve, reject) => { this.rejectPlay = reject; });
        if (window.failAudio) return Promise.reject(new Error('offline'));
        this.paused = false;
        return Promise.resolve();
      }
      pause() { this.paused = true; }
    };
  });
  await page.clock.install();
  await page.goto(origin);
  await page.locator('[data-mood="music"]').click();
  return page;
}

test('real rain and tape play together with independent volume and weather strength', async t => {
  const page = await openRoom(t);
  await page.locator('#player-play').click();
  await page.locator('#music-rain').click();
  await page.clock.runFor(1800);
  assert.equal(await page.locator('body').evaluate(el => el.classList.contains('has-rain')), true);
  assert.equal(await page.locator('#player-play').textContent(), 'pause');
  assert.equal(await page.evaluate(() => window.media.filter(a => !a.paused).length), 2);
  await page.locator('#room-volume').fill('35');
  assert.equal(await page.evaluate(() => ambienceTrack.volume), 0.55 * 0.35);
  assert.equal(await page.evaluate(() => tapeVolume), 0.55);
  await page.locator('[data-rain="downpour"]').click();
  await page.clock.runFor(1800);
  assert.match(await page.evaluate(() => ambienceTrack.src), /Thunderstorm/);
  assert.equal(await page.evaluate(() => window.media.filter(a => !a.paused).length), 2);
  await page.locator('#music-rain').click();
  await page.clock.runFor(800);
  assert.equal(await page.evaluate(() => window.media.filter(a => !a.paused).length), 1);
  assert.equal(await page.locator('#player-play').textContent(), 'pause');
});

test('rain preference survives reload and radio iframe survives weather changes', async t => {
  const page = await openRoom(t);
  await page.locator('#music-rain').click();
  await page.reload();
  assert.equal(await page.locator('#music-rain').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-station="radio"]').click();
  await page.locator('#radio-frame iframe').evaluate(el => { el.dataset.original = 'yes'; });
  await page.locator('[data-rain="drizzle"]').click();
  await page.locator('#music-rain').click();
  assert.equal(await page.locator('#radio-frame iframe').getAttribute('data-original'), 'yes');
});

test('unavailable recording offers retry and never replaces rain with generated noise', async t => {
  const page = await openRoom(t);
  await page.evaluate(() => { window.failAudio = true; });
  await page.locator('#music-rain').click();
  await page.waitForFunction(() => document.getElementById('listen').textContent === 'retry');
  assert.match(await page.locator('#ambience-name').textContent(), /recording unavailable/);
  assert.equal(await page.evaluate(() => audioCtx), null);
  await page.evaluate(() => { window.failAudio = false; });
  await page.locator('#listen').click();
  assert.equal(await page.locator('#listen').textContent(), 'listening');
});

test('a late rejection from a previous room cannot stop the current recording', async t => {
  const page = await openRoom(t);
  await page.evaluate(() => { window.deferAudio = true; });
  await page.locator('#music-rain').click();
  await page.evaluate(() => { window.oldTrack = ambienceTrack; window.deferAudio = false; });
  await page.locator('[data-mood="calm"]').click();
  await page.evaluate(() => window.oldTrack.rejectPlay(new Error('late network failure')));
  assert.equal(await page.locator('#listen').textContent(), 'listening');
  assert.match(await page.evaluate(() => ambienceTrack.src), /Ocean/);
});

test('music mix fits a narrow screen and rain shortcuts work with music', async t => {
  const page = await openRoom(t, 320);
  await page.locator('#music-rain').click();
  await page.keyboard.press(']');
  assert.equal(await page.locator('body').getAttribute('data-rain'), 'downpour');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});


test('window seat preserves both playing layers and restores focus, scroll and weather canvas', async t => {
  const page = await openRoom(t);
  await page.locator('#player-play').click();
  await page.locator('#music-rain').click();
  await page.clock.runFor(2000);
  await page.locator('#window-open').click();
  assert.equal(await page.locator('#window-close').evaluate(el => el === document.activeElement), true);
  assert.equal(await page.locator('#journal-note').evaluate(el => el.closest('[inert]') !== null), true);
  assert.equal(await page.locator('#window-outside #rain').count(), 1);
  assert.equal(await page.evaluate(() => window.media.filter(a => !a.paused).length), 2);
  await page.keyboard.press('1');
  assert.equal(await page.locator('body').getAttribute('data-mood'), 'music');
  await page.locator('#window-play').click();
  await page.clock.runFor(1400);
  assert.equal(await page.evaluate(() => window.media.filter(a => !a.paused).length), 1);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#window-view').isVisible(), false);
  assert.equal(await page.locator('#window-open').evaluate(el => el === document.activeElement), true);
  assert.equal(await page.locator('body > #rain').count(), 1);
  assert.equal(await page.locator('.room [inert]').count(), 0);
});

test('the desk lamp remembers its position and the clock stays live', async t => {
  const page = await openRoom(t);
  await page.locator('#window-open').click();
  await page.locator('#desk-lamp').click();
  assert.equal(await page.locator('#desk-lamp').getAttribute('aria-pressed'), 'false');
  const oldTime = await page.locator('#window-clock').textContent();
  await page.clock.fastForward(60000);
  assert.notEqual(await page.locator('#window-clock').textContent(), oldTime);
  assert.equal(await page.locator('#window-clock').textContent(), await page.locator('#clock').textContent());
  await page.reload();
  await page.locator('#window-open').click();
  assert.equal(await page.locator('#desk-lamp').getAttribute('aria-pressed'), 'false');
});

test('official radio stays visible, clickable and keeps its iframe in the window seat', async t => {
  const page = await openRoom(t);
  await page.locator('[data-station="radio"]').click();
  await page.locator('#radio-frame iframe').evaluate(el => { el.dataset.original = 'yes'; });
  await page.locator('#window-open').click();
  const frame = page.locator('#radio-frame iframe');
  assert.equal(await frame.getAttribute('data-original'), 'yes');
  assert.equal(await frame.isVisible(), true);
  assert.equal(await frame.evaluate(el => {
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el;
  }), true);
  assert.equal(await frame.evaluate(el => !!el.closest('[inert]')), false);
  await page.locator('#window-close').click();
  assert.equal(await frame.getAttribute('data-original'), 'yes');
});

test('window controls fit desktop, narrow phone and landscape, including radio', async t => {
  for (const viewport of [{width:1280,height:900}, {width:320,height:640}, {width:844,height:390}]) {
    const page = await openRoom(t, viewport.width);
    await page.setViewportSize(viewport);
    await page.locator('#music-rain').click();
    await page.locator('#window-open').click();
    for (const id of ['window-close', 'window-play', 'window-rain', 'window-listen', 'desk-lamp']) {
      const box = await page.locator('#' + id).boundingBox();
      assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, id + ' fits ' + viewport.width);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.ATMOSPHERE_PREVIEW_DIR) {
      await page.screenshot({ path: path.join(process.env.ATMOSPHERE_PREVIEW_DIR, 'window-' + viewport.width + '.png'), animations: 'disabled' });
    }
    await page.locator('#window-close').click();
    await page.locator('[data-station="radio"]').click();
    await page.locator('#window-open').click();
    const frame = await page.locator('#radio-frame').boundingBox();
    const close = await page.locator('#window-close').boundingBox();
    assert.ok(frame.y >= close.y + close.height, 'radio does not cover exit');
    assert.ok(frame.x >= 0 && frame.x + frame.width <= viewport.width && frame.y + frame.height <= viewport.height);
  }
});


test('animated rain keeps drawing inside the window and returns to the main room', async t => {
  const page = await openRoom(t, 1280, 'no-preference');
  await page.locator('#music-rain').click();
  await page.locator('#window-open').click();
  await page.clock.runFor(1800);
  assert.equal(await page.locator('#rain').evaluate(el => el.classList.contains('is-on')), true);
  assert.ok(await page.evaluate(() => rainFrame !== null && drops.length > 0));
  assert.equal(await page.locator('#window-outside #rain').count(), 1);
  if (process.env.ATMOSPHERE_PREVIEW_DIR) {
    await page.screenshot({ path: path.join(process.env.ATMOSPHERE_PREVIEW_DIR, 'window-rain.png') });
  }
  await page.locator('#window-close').click();
  await page.locator('[data-mood="calm"]').click();
  assert.equal(await page.evaluate(() => rainFrame), null);
});

test('Space opens the window invitation in Focus without starting the timer', async t => {
  const page = await openRoom(t);
  await page.locator('[data-mood="focus"]').click();
  await page.locator('#window-open').focus();
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#window-view').isVisible(), true);
  assert.equal(await page.locator('#focus-toggle').textContent(), 'start');
  await page.keyboard.press('Escape');
});
