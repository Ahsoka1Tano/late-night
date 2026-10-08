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
  await page.locator('.mood[data-mood="music"]').click();
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
  await page.locator('.mood[data-mood="calm"]').click();
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



test('the window, player and journal belong to the initial room without an entry button', async t => {
  const page = await openRoom(t);
  assert.equal(await page.locator('#window-view').isVisible(), true);
  assert.equal(await page.locator('#window-open, #window-close').count(), 0);
  assert.equal(await page.locator('#player-play').isVisible(), true);
  assert.equal(await page.locator('#window-outside #rain').count(), 1);
  assert.equal(await page.locator('[inert]').count(), 0);
  await page.locator('#player-play').click();
  await page.locator('#music-rain').click();
  await page.clock.runFor(2000);
  await page.locator('#journal-note').fill('An evening in one room.');
  assert.equal(await page.evaluate(() => window.media.filter(a => !a.paused).length), 2);
  await page.reload();
  assert.equal(await page.locator('#journal-note').inputValue(), 'An evening in one room.');
});

test('the desk lamp remembers its position and the clock stays live', async t => {
  const page = await openRoom(t);
  await page.locator('#desk-lamp').click();
  assert.equal(await page.locator('#desk-lamp').getAttribute('aria-pressed'), 'false');
  const oldTime = await page.locator('#window-clock').textContent();
  await page.clock.fastForward(60000);
  assert.notEqual(await page.locator('#window-clock').textContent(), oldTime);
  assert.equal(await page.locator('#window-clock').textContent(), await page.locator('#clock').textContent());
  await page.reload();
  assert.equal(await page.locator('#desk-lamp').getAttribute('aria-pressed'), 'false');
});

test('all six moods keep the same room and expose only their relevant controls', async t => {
  const page = await openRoom(t);
  for (const mood of ['calm', 'music', 'focus', 'rain', 'space', 'sleep']) {
    await page.locator('.mood[data-mood="' + mood + '"]').click();
    assert.equal(await page.locator('#window-view').isVisible(), true);
    assert.equal(await page.locator('#player-play').isVisible(), mood === 'music');
    assert.equal(await page.locator('#focus-toggle').isVisible(), mood === 'focus');
    assert.equal(await page.locator('#music-rain').isVisible(), mood === 'music');
    assert.equal(await page.locator('#rain-dial').isVisible(), mood === 'rain');
    assert.equal(await page.locator('#radio-frame').isVisible(), false);
  }
});

test('the official radio stays on the desk while weather and lamp change', async t => {
  const page = await openRoom(t);
  await page.locator('[data-station="radio"]').click();
  await page.locator('#radio-frame iframe').evaluate(el => { el.dataset.original = 'yes'; });
  await page.locator('#music-rain').click();
  await page.locator('#desk-lamp').click();
  const frame = page.locator('#radio-frame iframe');
  await frame.scrollIntoViewIfNeeded();
  assert.equal(await frame.getAttribute('data-original'), 'yes');
  assert.equal(await frame.isVisible(), true);
  assert.equal(await frame.evaluate(el => {
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el;
  }), true);
});

test('the entire room fits desktop, narrow phone and landscape without clipped controls', async t => {
  for (const viewport of [{width:1440,height:1000}, {width:320,height:640}, {width:844,height:390}]) {
    const page = await openRoom(t, viewport.width);
    await page.setViewportSize(viewport);
    await page.locator('#music-rain').click();
    for (const id of ['evening-toggle', 'player-play', 'player-volume', 'music-rain', 'listen', 'desk-lamp', 'journal-note']) {
      const target = page.locator('#' + id);
      await target.scrollIntoViewIfNeeded();
      const box = await target.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= viewport.width, id + ' fits ' + viewport.width);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.ok(await page.locator('#skyline-near .apartment-window.is-lit').evaluateAll(lights =>
      lights.some(light => { const box = light.getBoundingClientRect(); return box.width > 0 && box.height > 0; })
    ), 'apartment lights remain visible in narrow buildings');
    await page.evaluate(() => scrollTo(0,0));
    if (process.env.ATMOSPHERE_PREVIEW_DIR) {
      await page.screenshot({ path: path.join(process.env.ATMOSPHERE_PREVIEW_DIR, 'room-' + viewport.width + '.png'), fullPage: true, animations: 'disabled' });
    }
    await page.locator('[data-station="radio"]').click();
    const frame = await page.locator('#radio-frame').boundingBox();
    assert.ok(frame.x >= 0 && frame.x + frame.width <= viewport.width && frame.width >= 200);
  }
});

test('animated rain stays in the window and stops when the weather changes', async t => {
  const page = await openRoom(t, 1280, 'no-preference');
  await page.locator('#music-rain').click();
  await page.clock.runFor(1800);
  assert.equal(await page.locator('#rain').evaluate(el => el.classList.contains('is-on')), true);
  assert.ok(await page.evaluate(() => rainFrame !== null && drops.length > 0));
  assert.equal(await page.locator('#window-outside #rain').count(), 1);
  await page.locator('.mood[data-mood="calm"]').click();
  assert.equal(await page.evaluate(() => rainFrame), null);
});

test('keyboard moods and the focus timer stay available in the room', async t => {
  const page = await openRoom(t);
  await page.locator('#desk-lamp').focus();
  await page.keyboard.press('3');
  assert.equal(await page.locator('body').getAttribute('data-mood'), 'focus');
  await page.locator('#focus-toggle').focus();
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#focus-toggle').textContent(), 'pause');
  await page.locator('#focus-reset').click();
  assert.equal(await page.locator('#focus-toggle').textContent(), 'start');
});


test('one window gesture starts and pauses both layers while preserving volume and journal', async t => {
  const page = await openRoom(t);
  await page.locator('#journal-note').fill('A small night.');
  await page.evaluate(() => { setVolume(.32); setRoomVolume(.45); });
  await page.locator('.mood[data-mood="calm"]').click();
  await page.locator('#evening-toggle').click();
  await page.clock.runFor(3000);
  assert.equal(await page.locator('body').getAttribute('data-mood'), 'music');
  assert.equal(await page.locator('#evening-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => window.media.filter(a => !a.paused).length), 2);
  assert.equal(await page.evaluate(() => tapeVolume), .32);
  assert.equal(await page.evaluate(() => roomVolume), .45);
  assert.equal(await page.locator('#journal-note').inputValue(), 'A small night.');
  await page.locator('#evening-toggle').click();
  await page.clock.runFor(1500);
  assert.equal(await page.evaluate(() => window.media.filter(a => !a.paused).length), 0);
  assert.equal(await page.locator('#evening-toggle').getAttribute('aria-pressed'), 'false');
  await page.locator('#evening-toggle').click();
  await page.clock.runFor(3000);
  assert.equal(await page.evaluate(() => window.media.filter(a => !a.paused).length), 2);
});

test('the combined switch follows individual controls and stays out of the official radio', async t => {
  const page = await openRoom(t);
  await page.locator('#evening-toggle').click();
  await page.locator('#listen').click();
  assert.equal(await page.locator('#evening-toggle').getAttribute('aria-pressed'), 'false');
  await page.locator('#listen').click();
  await page.waitForFunction(() => document.getElementById('evening-toggle').getAttribute('aria-pressed') === 'true');
  await page.locator('#player-play').click();
  assert.equal(await page.locator('#evening-toggle').getAttribute('aria-pressed'), 'false');
  await page.locator('[data-station="radio"]').click();
  assert.equal(await page.locator('#evening-toggle').isVisible(), false);
  await page.locator('[data-station="tape"]').click();
  assert.equal(await page.locator('#evening-toggle').isVisible(), true);
});

test('the hidden sky can still be discovered from the unified room', async t => {
  const page = await openRoom(t);
  await page.locator('#desk-lamp').focus();
  await page.keyboard.type('moon');
  assert.equal(await page.locator('body').getAttribute('data-mood'), 'aurora');
  assert.equal(await page.locator('.mood[data-mood="aurora"]').isVisible(), true);
});


async function litApartments(page) {
  return page.locator('#skyline-near .apartment-window').evaluateAll(lights => lights.map(light => light.classList.contains('is-lit')));
}

test('the city changes one apartment at a time and Sleep only turns lights off', async t => {
  const page = await openRoom(t, 1280, 'no-preference');
  const before = await litApartments(page);
  await page.clock.runFor(10000);
  const after = await litApartments(page);
  assert.equal(after.filter((lit, index) => lit !== before[index]).length, 1);
  await page.locator('.mood[data-mood="sleep"]').click();
  const sleepy = await litApartments(page);
  await page.clock.runFor(10000);
  const later = await litApartments(page);
  assert.equal(later.filter(Boolean).length, sleepy.filter(Boolean).length - 1);
  assert.equal(later.some((lit, index) => lit && !sleepy[index]), false);
});

test('city life pauses in a hidden tab, Space and when reduced motion changes', async t => {
  const page = await openRoom(t, 1280, 'no-preference');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hidden = await litApartments(page);
  await page.clock.runFor(20000);
  assert.deepEqual(await litApartments(page), hidden);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(10000);
  assert.notDeepEqual(await litApartments(page), hidden);
  await page.locator('.mood[data-mood="space"]').click();
  const space = await litApartments(page);
  await page.clock.runFor(20000);
  assert.deepEqual(await litApartments(page), space);
  await page.locator('.mood[data-mood="music"]').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => document.body.classList.contains('city-is-paused'));
  const still = await litApartments(page);
  await page.clock.runFor(20000);
  assert.deepEqual(await litApartments(page), still);
});


test('choosing a paused tape remembers it without starting audio', async t => {
 const page = await openRoom(t);
 await page.waitForFunction(() => document.querySelectorAll('#tape-choice option').length > 1);
 const src = await page.locator('#tape-choice option').nth(1).getAttribute('value');
 await page.locator('#tape-choice').selectOption(src);
 assert.equal(await page.evaluate(() => window.media.filter(a => !a.paused).length), 0);
 await page.reload();
 await page.waitForFunction(() => document.querySelectorAll('#tape-choice option').length > 1);
 assert.equal(await page.locator('#tape-choice').inputValue(), src);
 await page.locator('#player-play').click();
 assert.equal(await page.evaluate(() => tapeAudio.src), src);
});

test('choosing a playing tape replaces only the music and preserves the rain', async t => {
 const page = await openRoom(t);
 await page.waitForFunction(() => document.querySelectorAll('#tape-choice option').length > 1);
 await page.locator('#evening-toggle').click();
 await page.clock.runFor(3000);
 await page.evaluate(() => { window.originalRain = ambienceTrack; window.originalTape = tapeAudio; });
 const src = await page.locator('#tape-choice option').nth(2).getAttribute('value');
 await page.locator('#tape-choice').selectOption(src);
 await page.clock.runFor(3000);
 assert.equal(await page.evaluate(() => window.originalTape.paused), true);
 assert.equal(await page.evaluate(() => ambienceTrack === window.originalRain && !ambienceTrack.paused), true);
 assert.equal(await page.evaluate(() => tapeAudio.src), src);
 assert.equal(await page.evaluate(() => window.media.filter(a => !a.paused).length), 2);
});


test('saved tapes persist, filter without playback, and Next follows the saved shelf', async t => {
 const page = await openRoom(t);
 await page.waitForFunction(() => document.querySelectorAll('#tape-choice option').length > 2);
 const values = await page.locator('#tape-choice option').evaluateAll(options => options.slice(0,2).map(option => option.value));
 for (const src of values) {
  await page.locator('#tape-choice').selectOption(src);
  await page.locator('#tape-keep').click();
 }
 await page.reload();
 await page.waitForFunction(() => document.getElementById('tape-filter').textContent.includes('2'));
 await page.locator('#tape-filter').click();
 assert.equal(await page.locator('#tape-choice option').count(), 2);
 assert.equal(await page.evaluate(() => window.media.filter(a => !a.paused).length), 0);
 await page.locator('#player-next').click();
 assert.equal(await page.locator('#tape-choice').inputValue(), values[0]);
 await page.locator('#tape-keep').click();
 await page.locator('#player-next').click();
 assert.equal(await page.locator('#tape-choice').inputValue(), values[1]);
 await page.locator('#tape-keep').click();
 assert.equal(await page.locator('#tape-filter').isDisabled(), true);
 assert.ok(await page.locator('#tape-choice option').count() > 2);
});

test('a late rejected play from an old tape cannot start synthetic fallback', async t => {
 const page = await openRoom(t);
 await page.waitForFunction(() => document.querySelectorAll('#tape-choice option').length > 2);
 await page.evaluate(() => { window.deferAudio = true; });
 await page.locator('#player-play').click();
 await page.evaluate(() => { window.oldTape = tapeAudio; window.deferAudio = false; });
 const src = await page.locator('#tape-choice option').nth(1).getAttribute('value');
 await page.locator('#tape-choice').selectOption(src);
 await page.evaluate(() => window.oldTape.rejectPlay(new Error('late failure')));
 assert.equal(await page.evaluate(() => onSynth), false);
 assert.equal(await page.evaluate(() => tapeAudio.src), src);
 assert.equal(await page.evaluate(() => audioCtx), null);
});


test('changing the window view preserves music, rain, notes and the official radio', async t => {
 const page = await openRoom(t);
 await page.locator('#evening-toggle').click();
 await page.clock.runFor(3000);
 await page.locator('#journal-note').fill('Looking beyond the city.');
 await page.evaluate(() => { window.viewTape = tapeAudio; window.viewRain = ambienceTrack; });
 await page.locator('.view-switch [data-view="mountains"]').click();
 assert.equal(await page.evaluate(() => tapeAudio === window.viewTape && ambienceTrack === window.viewRain), true);
 assert.equal(await page.evaluate(() => window.media.filter(a => !a.paused).length), 2);
 assert.equal(await page.locator('body').getAttribute('data-mood'), 'music');
 assert.equal(await page.locator('#journal-note').inputValue(), 'Looking beyond the city.');
 await page.locator('[data-station="radio"]').click();
 await page.locator('#radio-frame iframe').evaluate(el => { el.dataset.viewContinuity = 'yes'; });
 await page.locator('.view-switch [data-view="city"]').click();
 assert.equal(await page.locator('#radio-frame iframe').getAttribute('data-view-continuity'), 'yes');
});

test('the mountain view is remembered and changing moods does not change it', async t => {
 const page = await openRoom(t);
 await page.locator('.view-switch [data-view="mountains"]').click();
 await page.reload();
 assert.equal(await page.locator('body').getAttribute('data-view'), 'mountains');
 assert.equal(await page.locator('.view-switch [data-view="mountains"]').getAttribute('aria-pressed'), 'true');
 await page.locator('.mood[data-mood="focus"]').click();
 assert.equal(await page.locator('body').getAttribute('data-view'), 'mountains');
 assert.equal(await page.locator('#focus-toggle').isVisible(), true);
});

test('both window views fit narrow phones and desktop without covering the clock', async t => {
 for (const width of [320,1280]) {
  const page = await openRoom(t,width);
  await page.locator('.view-switch [data-view="mountains"]').click();
  const controls = await page.locator('.view-switch').boundingBox();
  const clock = await page.locator('.window-time').boundingBox();
  assert.ok(controls.x >= 0 && controls.x + controls.width <= width);
  assert.ok(controls.y + controls.height <= clock.y, 'view controls stay above the clock');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  if (process.env.ATMOSPHERE_PREVIEW_DIR) {
   await page.locator('#window-view').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR,'mountains-'+width+'.png'),animations:'disabled'});
  }
 }
});


test('mountain stars follow the weather and reduced motion without starting audio', async t => {
 const page = await openRoom(t,1280,'no-preference');
 await page.locator('.view-switch [data-view="mountains"]').click();
 assert.equal(await page.evaluate(() => starsFrame !== null), true);
 assert.equal(await page.evaluate(() => cityLightsTimer), null);
 assert.equal(await page.evaluate(() => window.media.filter(a => !a.paused).length), 0);
 await page.locator('#music-rain').click();
 assert.equal(await page.evaluate(() => starsFrame), null);
 await page.locator('#music-rain').click();
 assert.equal(await page.evaluate(() => starsFrame !== null), true);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.waitForFunction(() => starsFrame === null);
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.waitForFunction(() => starsFrame !== null);
 await page.locator('.view-switch [data-view="city"]').click();
 assert.equal(await page.evaluate(() => starsFrame), null);
 assert.equal(await page.locator('body').getAttribute('data-view'),'city');
});
