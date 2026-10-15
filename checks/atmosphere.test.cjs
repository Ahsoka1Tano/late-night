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


test('desk light tone survives reload and preserves the switched-off lamp', async t => {
 const page = await openRoom(t);
 await page.locator('.light-tones [data-light="moon"]').click();
 await page.locator('#desk-lamp').click();
 await page.reload();
 assert.equal(await page.locator('#window-view').getAttribute('data-light'),'moon');
 assert.equal(await page.locator('#desk-lamp').getAttribute('aria-pressed'),'false');
 assert.equal(await page.locator('.light-tones [data-light="moon"]').getAttribute('aria-pressed'),'true');
 await page.locator('.light-tones [data-light="dim"]').click();
 assert.equal(await page.locator('#desk-lamp').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#light-state').textContent(),'dim · on');
});

test('changing desk lighting preserves the view, tape and real rain', async t => {
 const page = await openRoom(t);
 await page.locator('#evening-toggle').click();
 await page.clock.runFor(3000);
 await page.locator('.view-switch [data-view="mountains"]').click();
 await page.evaluate(() => { window.lightTape = tapeAudio; window.lightRain = ambienceTrack; });
 await page.locator('.light-tones [data-light="moon"]').click();
 assert.equal(await page.evaluate(() => tapeAudio === window.lightTape && ambienceTrack === window.lightRain),true);
 assert.equal(await page.evaluate(() => window.media.filter(a => !a.paused).length),2);
 assert.equal(await page.locator('body').getAttribute('data-view'),'mountains');
 assert.equal(await page.locator('body').getAttribute('data-mood'),'music');
});


test('the dimmer changes visible lamp light, restores its level and keeps an off lamp off', async t => {
 const page = await openRoom(t);
 await page.locator('.light-tones [data-light="moon"]').click();
 await page.locator('#light-brightness').fill('35');
 await page.locator('.desk-glow').evaluate(el => el.getAnimations().forEach(animation => animation.finish()));
 assert.equal(await page.locator('#light-level').textContent(),'35%');
 assert.ok(Math.abs(await page.locator('.desk-glow').evaluate(el => Number(getComputedStyle(el).opacity)) - .35) < .001);
 await page.locator('#desk-lamp').click();
 assert.equal(await page.locator('#desk-lamp').getAttribute('aria-pressed'),'false');
 await page.locator('.desk-glow').evaluate(el => el.getAnimations().forEach(animation => animation.finish()));
 assert.equal(await page.locator('.desk-glow').evaluate(el => getComputedStyle(el).opacity),'0');
 await page.reload();
 assert.equal(await page.locator('#light-brightness').inputValue(),'35');
 assert.equal(await page.locator('#desk-lamp').getAttribute('aria-pressed'),'false');
 assert.equal(await page.locator('#window-view').getAttribute('data-light'),'moon');
 await page.locator('#light-brightness').fill('80');
 assert.equal(await page.locator('#desk-lamp').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#light-level').textContent(),'80%');
});

test('light controls fit a narrow phone and remain usable with the keyboard', async t => {
 const page = await openRoom(t,320);
 const slider = page.locator('#light-brightness');
 await slider.scrollIntoViewIfNeeded();
 const box = await slider.boundingBox();
 assert.ok(box.x >= 0 && box.x + box.width <= 320);
 await slider.focus();
 await page.keyboard.press('ArrowLeft');
 assert.equal(await slider.inputValue(),'69');
 assert.equal(await page.locator('body').getAttribute('data-mood'),'music');
 if (process.env.ATMOSPHERE_PREVIEW_DIR) {
  await page.locator('.room-light').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR,'desk-light-320.png'),animations:'disabled'});
 }
});


test('ready-made evenings apply distinct views, weather, lighting and sound layers', async t => {
 const page = await openRoom(t);
 await page.locator('#journal-note').fill('Keep my note through each scene.');
 for (const [key,mood,view,tone,strength,sounds] of [
  ['records','music','city','amber','70',2],
  ['hideaway','music','mountains','moon','45',1],
  ['lastlight','sleep','mountains','dim','20',1],
 ]) {
  await page.locator('[data-evening="'+key+'"]').click();
  await page.clock.runFor(3000);
  assert.equal(await page.locator('body').getAttribute('data-mood'),mood);
  assert.equal(await page.locator('body').getAttribute('data-view'),view);
  assert.equal(await page.locator('#window-view').getAttribute('data-light'),tone);
  assert.equal(await page.locator('#light-brightness').inputValue(),strength);
  assert.equal(await page.evaluate(() => window.media.filter(a => !a.paused).length),sounds);
  assert.equal(await page.locator('[data-evening="'+key+'"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#journal-note').inputValue(),'Keep my note through each scene.');
 }
 await page.reload();
 assert.equal(await page.locator('body').getAttribute('data-view'),'mountains');
 assert.equal(await page.locator('#window-view').getAttribute('data-light'),'dim');
});

test('manual lighting changes make the ready-made scene stop looking selected', async t => {
 const page = await openRoom(t);
 await page.locator('[data-evening="records"]').click();
 await page.locator('#light-brightness').fill('60');
 await page.waitForFunction(() => document.querySelector('[data-evening="records"]').getAttribute('aria-pressed') === 'false');
 assert.equal(await page.locator('#light-brightness').inputValue(),'60');
});


test('your evening restores a saved mountain setup, dimmer and off lamp without starting a paused tape', async t => {
 const page = await openRoom(t);
 await page.locator('.view-switch [data-view="mountains"]').click();
 await page.locator('.light-tones [data-light="moon"]').click();
 await page.locator('#light-brightness').fill('37');
 await page.locator('#desk-lamp').click();
 await page.locator('#keep-evening').click();
 await page.locator('[data-evening="records"]').click();
 await page.reload();
 assert.equal(await page.locator('[data-evening="personal"]').isVisible(),true);
 await page.locator('[data-evening="personal"]').click();
 await page.clock.runFor(3000);
 assert.equal(await page.locator('body').getAttribute('data-view'),'mountains');
 assert.equal(await page.locator('#window-view').getAttribute('data-light'),'moon');
 assert.equal(await page.locator('#light-brightness').inputValue(),'37');
 assert.equal(await page.locator('#desk-lamp').getAttribute('aria-pressed'),'false');
 assert.equal(await page.evaluate(() => window.media.filter(a => !a.paused).length),0);
});

test('saving failures preserve the previous saved evening and forgetting it leaves playback alone', async t => {
 const page = await openRoom(t);
 await page.locator('[data-evening="records"]').click();
 await page.locator('#keep-evening').click();
 const kept = await page.evaluate(() => localStorage.getItem('lateNight.personalScene'));
 await page.evaluate(() => {
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key,value) {if(key === 'lateNight.personalScene')throw new Error('quota');return original.call(this,key,value)};
 });
 await page.locator('[data-evening="hideaway"]').click();
 await page.locator('#keep-evening').click();
 assert.equal(await page.evaluate(() => localStorage.getItem('lateNight.personalScene')),kept);
 assert.match(await page.locator('#scene-status').textContent(),/Couldn't keep/);
 await page.clock.runFor(3000);
 await page.evaluate(() => {window.forgetTape = tapeAudio;});
 await page.locator('#forget-evening').click();
 assert.equal(await page.locator('[data-evening="personal"]').isVisible(),false);
 assert.equal(await page.evaluate(() => tapeAudio === window.forgetTape && !tapeAudio.paused),true);
 assert.equal(await page.locator('#keep-evening').evaluate(el => el === document.activeElement),true);
});

test('corrupted saved scene is ignored without overwriting it', async t => {
 const page = await openRoom(t);
 await page.evaluate(() => localStorage.setItem('lateNight.personalScene','{broken'));
 await page.reload();
 assert.equal(await page.locator('[data-evening="personal"]').isVisible(),false);
 assert.equal(await page.evaluate(() => localStorage.getItem('lateNight.personalScene')),'{broken');
});

test('illustrated evening cards fit phones, tablets and desktop with a saved scene', async t => {
 for (const width of [320,768,1440]) {
  const page = await openRoom(t,width);
  await page.locator('#keep-evening').click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
  for(const key of ['records','hideaway','lastlight','personal']) {
   const box = await page.locator('[data-evening="'+key+'"]').boundingBox();
   assert.ok(box.x >= 0 && box.x + box.width <= width,key + ' fits ' + width);
  }
  await page.evaluate(() => scrollTo(0,0));
  if(process.env.ATMOSPHERE_PREVIEW_DIR) {
   await page.screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR,'evenings-'+width+'.png'),fullPage:true,animations:'disabled'});
   if(width === 1440)await page.locator('.evening-scenes').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR,'evening-scenes.png'),animations:'disabled'});
  }
 }
});


test('cup controls remember the drink and return keyboard focus on Escape', async t => {
 const page = await openRoom(t);
 await page.locator('#window-cup').click();
 assert.equal(await page.locator('#cup-ritual').isVisible(),true);
 assert.equal(await page.locator('.drink-choices [data-drink="tea"]').evaluate(el=>el===document.activeElement),true);
 await page.locator('.drink-choices [data-drink="coffee"]').click();
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#cup-ritual').isVisible(),false);
 assert.equal(await page.locator('#window-cup').evaluate(el=>el===document.activeElement),true);
 await page.reload();
 assert.equal(await page.locator('#window-cup').getAttribute('data-drink'),'coffee');
});

test('a drink ritual does not restart the playing tape or rain', async t => {
 const page = await openRoom(t);
 await page.locator('#evening-toggle').click();
 await page.clock.runFor(3000);
 await page.evaluate(()=>{window.drinkTape=tapeAudio;window.drinkRain=ambienceTrack});
 await page.locator('#window-cup').click();
 await page.locator('.drink-choices [data-drink="coffee"]').click();
 assert.equal(await page.evaluate(()=>tapeAudio===window.drinkTape&&ambienceTrack===window.drinkRain),true);
 assert.equal(await page.evaluate(()=>window.media.filter(a=>!a.paused).length),2);
});


test('a cup cools over five minutes and warming it restores fresh steam', async t => {
 const page = await openRoom(t);
 assert.equal(await page.locator('#window-cup').getAttribute('data-heat'),'fresh');
 await page.clock.fastForward(120000);
 assert.equal(await page.locator('#window-cup').getAttribute('data-heat'),'warm');
 await page.clock.fastForward(180000);
 assert.equal(await page.locator('#window-cup').getAttribute('data-heat'),'cool');
 await page.locator('#window-cup').click();
 await page.locator('#cup-warm').click();
 assert.equal(await page.locator('#window-cup').getAttribute('data-heat'),'fresh');
 assert.match(await page.locator('#cup-note').textContent(),/Freshly poured/);
});

test('returning to a hidden tab catches up with cup cooling using real elapsed time', async t => {
 const page = await openRoom(t);
 const now = await page.evaluate(()=>Date.now());
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});
 await page.clock.setSystemTime(new Date(now+600000));
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))});
 assert.equal(await page.locator('#window-cup').getAttribute('data-heat'),'cool');
});

test('a personal evening remembers coffee and older saved scenes still restore', async t => {
 const page = await openRoom(t);
 await page.locator('#window-cup').click();
 await page.locator('.drink-choices [data-drink="coffee"]').click();
 await page.locator('#cup-close').click();
 await page.locator('#keep-evening').click();
 await page.locator('[data-evening="records"]').click();
 assert.equal(await page.locator('#window-cup').getAttribute('data-drink'),'tea');
 await page.reload();
 await page.locator('[data-evening="personal"]').click();
 assert.equal(await page.locator('#window-cup').getAttribute('data-drink'),'coffee');
 await page.evaluate(()=>{const value=JSON.parse(localStorage.getItem('lateNight.personalScene'));delete value.drink;localStorage.setItem('lateNight.personalScene',JSON.stringify(value))});
 await page.reload();
 assert.equal(await page.locator('[data-evening="personal"]').isVisible(),true);
 await page.locator('[data-evening="personal"]').click();
 assert.equal(await page.locator('#window-cup').getAttribute('data-drink'),'coffee');
});

test('the cup and drink controls stay accessible inside desktop and narrow phone scenes', async t => {
 for(const width of [320,1280]) {
  const page = await openRoom(t,width);
  const cup=await page.locator('#window-cup').boundingBox();
  assert.ok(cup.width>=44&&cup.height>=44);
  await page.locator('#window-cup').click();
  const scene=await page.locator('#window-view').boundingBox();
  const panel=await page.locator('#cup-ritual').boundingBox();
  assert.ok(panel.x>=scene.x&&panel.x+panel.width<=scene.x+scene.width);
  assert.ok(panel.y>=scene.y&&panel.y+panel.height<=scene.y+scene.height);
  assert.equal(await page.locator('.cup-steam > i').first().isVisible(),false,'reduced motion hides the animated steam');
  if(process.env.ATMOSPHERE_PREVIEW_DIR)await page.locator('#window-view').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR,'cup-'+width+'.png'),animations:'disabled'});
 }
});


test('outside sky and moon shapes survive reload without changing music or rain', async t => {
 const page=await openRoom(t);
 await page.locator('#evening-toggle').click();await page.clock.runFor(3000);
 await page.evaluate(()=>{window.skyTape=tapeAudio;window.skyRain=ambienceTrack});
 await page.locator('#outside-sky summary').click();
 await page.locator('.sky-choices [data-sky="violet"]').click();
 await page.locator('.moon-choices [data-moon="crescent"]').click();
 assert.equal(await page.evaluate(()=>tapeAudio===window.skyTape&&ambienceTrack===window.skyRain),true);
 assert.equal(await page.evaluate(()=>window.media.filter(a=>!a.paused).length),2);
 assert.equal(await page.locator('.moon-crescent').isVisible(),true);
 assert.equal(await page.locator('.moon-full').isVisible(),false);
 await page.reload();
 assert.equal(await page.locator('#window-view').getAttribute('data-sky'),'violet');
 assert.equal(await page.locator('#window-view').getAttribute('data-moon'),'crescent');
});

test('personal evening restores sky and moon and accepts older snapshots without them', async t => {
 const page=await openRoom(t);
 await page.locator('#outside-sky summary').click();
 await page.locator('.sky-choices [data-sky="afterglow"]').click();
 await page.locator('.moon-choices [data-moon="half"]').click();
 await page.locator('#keep-evening').click();
 await page.locator('[data-evening="records"]').click();
 assert.equal(await page.locator('#window-view').getAttribute('data-sky'),'mood');
 await page.reload();await page.locator('[data-evening="personal"]').click();
 assert.equal(await page.locator('#window-view').getAttribute('data-sky'),'afterglow');
 assert.equal(await page.locator('#window-view').getAttribute('data-moon'),'half');
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('lateNight.personalScene'));delete s.sky;delete s.moon;localStorage.setItem('lateNight.personalScene',JSON.stringify(s))});
 await page.reload();await page.locator('[data-evening="personal"]').click();
 assert.equal(await page.locator('#window-view').getAttribute('data-sky'),'afterglow');
});

test('shooting stars require clear skies and finish with elapsed time', async t => {
 const page=await openRoom(t,1280,'no-preference');
 await page.locator('#outside-sky summary').click();
 assert.equal(await page.locator('#meteor-button').isDisabled(),true);
 await page.locator('.view-switch [data-view="mountains"]').click();
 await page.locator('#meteor-button').click();
 assert.equal(await page.evaluate(()=>comet!==null),true);
 await page.clock.fastForward(3000);
 assert.equal(await page.evaluate(()=>comet),null);
 await page.locator('#music-rain').click();
 assert.equal(await page.locator('#meteor-button').isDisabled(),true);
 await page.locator('#music-rain').click();
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.waitForFunction(()=>document.getElementById('meteor-button').disabled);
 assert.equal(await page.evaluate(()=>comet),null);
});

test('night sky controls fit a phone and desktop, with visible half and crescent moons', async t => {
 for(const width of [320,1440]){
  const page=await openRoom(t,width);
  await page.locator('#outside-sky summary').click();
  for(const shape of ['half','crescent','full']){
   await page.locator('.moon-choices [data-moon="'+shape+'"]').click();
   assert.equal(await page.locator('.moon-'+shape).isVisible(),true);
  }
  for(const palette of ['midnight','violet','afterglow','mood'])await page.locator('.sky-choices [data-sky="'+palette+'"]').click();
  await page.locator('.sky-choices [data-sky="violet"]').click();
  await page.locator('.moon-choices [data-moon="crescent"]').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  for(const id of ['outside-sky','meteor-button']){
   const box=await page.locator('#'+id).boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);
  }
  if(process.env.ATMOSPHERE_PREVIEW_DIR){
   await page.locator('#window-view').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR,'sky-'+width+'.png'),animations:'disabled'});
   if(width===1440)await page.locator('#outside-sky').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR,'sky-controls.png'),animations:'disabled'});
  }
 }
});


test('requesting a meteor on a phone brings the visible sky back into view', async t=>{
 const page=await openRoom(t,320,'no-preference');
 await page.locator('.view-switch [data-view="mountains"]').click();
 await page.locator('#outside-sky summary').click();
 await page.locator('#meteor-button').click();
 assert.equal(await page.locator('#window-view').evaluate(el=>el===document.activeElement),true);
 const sky=await page.locator('#stars').boundingBox();
 assert.ok(sky.y>=0&&sky.y+sky.height<=900);
 assert.equal(await page.evaluate(()=>comet!==null),true);
});


test('coastal view changes preserve the playing tape, rain and notes', async t=>{
 const page=await openRoom(t);
 await page.locator('#evening-toggle').click();await page.clock.runFor(3000);
 await page.locator('#journal-note').fill('A night beside the bay.');
 await page.evaluate(()=>{window.coastTape=tapeAudio;window.coastRain=ambienceTrack});
 await page.locator('.view-switch [data-view="coast"]').click();
 assert.equal(await page.evaluate(()=>tapeAudio===window.coastTape&&ambienceTrack===window.coastRain),true);
 assert.equal(await page.locator('#journal-note').inputValue(),'A night beside the bay.');
 await page.reload();assert.equal(await page.locator('body').getAttribute('data-view'),'coast');
});

test('the harbour scene plays the existing ocean recording and remembers a disabled beacon', async t=>{
 const page=await openRoom(t);
 await page.locator('[data-evening="harbour"]').click();await page.clock.runFor(3000);
 assert.equal(await page.locator('body').getAttribute('data-view'),'coast');
 assert.equal(await page.locator('body').getAttribute('data-mood'),'calm');
 assert.match(await page.evaluate(()=>ambienceTrack.src),/Gentle%20Ocean/);
 assert.equal(await page.evaluate(()=>window.media.filter(a=>!a.paused).length),1);
 await page.locator('#outside-sky summary').click();await page.locator('#beacon-button').click();
 await page.locator('#keep-evening').click();
 await page.locator('[data-evening="records"]').click();
 await page.reload();await page.locator('[data-evening="personal"]').click();
 assert.equal(await page.locator('body').getAttribute('data-view'),'coast');
 assert.equal(await page.locator('#window-view').getAttribute('data-beacon'),'off');
 await page.locator('#outside-sky summary').click();await page.locator('#beacon-button').click();
 assert.equal(await page.locator('#window-view').getAttribute('data-beacon'),'on');
});

test('clear coastal skies support shooting stars and water respects reduced motion', async t=>{
 const page=await openRoom(t,1280,'no-preference');
 await page.locator('.view-switch [data-view="coast"]').click();
 await page.locator('#outside-sky summary').click();
 assert.equal(await page.locator('#meteor-button').isEnabled(),true);
 await page.locator('#meteor-button').click();assert.equal(await page.evaluate(()=>comet!==null),true);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.waitForFunction(()=>starsFrame===null);
 assert.equal(await page.locator('.sea-swells').evaluate(el=>getComputedStyle(el).animationName),'none');
});

test('coastal views and all five evening cards fit phones and desktop', async t=>{
 for(const width of [320,768,1440]){
  const page=await openRoom(t,width);
  await page.locator('[data-evening="harbour"]').click();
  await page.locator('#keep-evening').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  for(const key of ['records','hideaway','lastlight','harbour','personal']){
   const box=await page.locator('[data-evening="'+key+'"]').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);
  }
  if(process.env.ATMOSPHERE_PREVIEW_DIR)await page.locator('#window-view').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR,'coast-'+width+'.png'),animations:'disabled'});
 }
});

test('window focus mirrors an intention and keeps a session across moods', async t => {
  const page = await openRoom(t);
  await page.locator('.mood[data-mood="focus"]').click();
  await page.locator('#focus-intention').fill('Read a chapter <quietly>');
  assert.equal(await page.locator('#window-focus-task').textContent(), 'Read a chapter <quietly>');
  await page.locator('#window-focus-toggle').click();
  await page.clock.runFor(10000);
  assert.equal(await page.locator('#window-focus-time').textContent(), '24:50');
  await page.locator('.mood[data-mood="music"]').click();
  assert.equal(await page.locator('#window-focus').isVisible(), true);
  await page.locator('#window-focus-toggle').click();
  await page.clock.runFor(5000);
  assert.equal(await page.locator('#window-focus-time').textContent(), '24:50');
  await page.reload();
  assert.equal(await page.locator('#focus-intention').inputValue(), 'Read a chapter <quietly>');
});

test('quiet room keeps tape and rain playing and Escape returns to the desk', async t => {
  const page = await openRoom(t, 390);
  await page.locator('[data-evening="records"]').click();
  await page.clock.runFor(1500);
  const playing = await page.evaluate(() => window.media.filter(a => !a.paused).length);
  await page.locator('#quiet-room').click();
  assert.equal(await page.locator('.room-desk').isVisible(), false);
  assert.equal(await page.locator('.evening-scenes').isVisible(), false);
  assert.equal(await page.evaluate(() => window.media.filter(a => !a.paused).length), playing);
  assert.equal(await page.locator('#quiet-room').getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.room-desk').isVisible(), true);
  assert.equal(await page.locator('#quiet-room').getAttribute('aria-pressed'), 'false');
});

test('focus finishes once and a five minute break never adds work to the stats', async t => {
  const page = await openRoom(t);
  await page.locator('.mood[data-mood="focus"]').click();
  await page.locator('[data-minutes="15"]').click();
  await page.locator('#focus-toggle').click();
  assert.equal(await page.locator('[data-minutes="25"]').isDisabled(), true);
  await page.clock.fastForward(15 * 60000 + 300);
  assert.equal(await page.locator('#window-focus-time').textContent(), '00:00');
  assert.equal(await page.locator('#window-focus-label').textContent(), 'ENOUGH FOR NOW');
  const stats = await page.evaluate(() => readStats());
  await page.locator('#window-focus [data-focus-break]').click();
  assert.equal(await page.locator('#window-focus-time').textContent(), '05:00');
  await page.clock.fastForward(5 * 60000 + 300);
  assert.equal(await page.locator('#window-focus-time').textContent(), '00:00');
  assert.deepEqual(await page.evaluate(() => readStats()), stats);
  await page.locator('#window-focus [data-focus-break]').click();
  assert.equal(await page.locator('#window-focus-time').textContent(), '15:00');
  assert.equal(await page.locator('#focus-toggle').textContent(), 'start');
});

test('running and paused focus sessions survive refresh without starting audio', async t => {
  const page = await openRoom(t);
  await page.locator('.mood[data-mood="focus"]').click();
  await page.locator('#focus-toggle').click();
  await page.clock.runFor(10000);
  await page.reload();
  assert.equal(await page.locator('#focus-time').textContent(), '24:50');
  assert.equal(await page.locator('#focus-toggle').textContent(), 'pause');
  assert.equal(await page.evaluate(() => window.media.some(a => !a.paused)), false);
  await page.locator('#focus-toggle').click();
  await page.clock.fastForward(60000);
  await page.reload();
  assert.equal(await page.locator('#focus-time').textContent(), '24:50');
  assert.equal(await page.locator('#focus-toggle').textContent(), 'start');
});

test('an overdue saved session completes once and finished breaks restore separately', async t => {
  const page = await openRoom(t);
  await page.evaluate(() => {
    localStorage.setItem('lateNight.focusSession', JSON.stringify({minutes:15,phase:'focus',left:900000,endsAt:Date.now()-1000,done:false}));
  });
  await page.reload();
  assert.equal(await page.locator('#window-focus-label').textContent(), 'ENOUGH FOR NOW');
  const stats = await page.evaluate(() => readStats());
  assert.equal(stats.sessions, 1);
  assert.equal(stats.minutes, 15);
  await page.reload();
  assert.equal(await page.locator('#window-focus-time').textContent(), '00:00');
  assert.deepEqual(await page.evaluate(() => readStats()), stats);
  await page.locator('#window-focus [data-focus-break]').click();
  await page.clock.runFor(30000);
  await page.reload();
  assert.equal(await page.locator('#window-focus-time').textContent(), '04:30');
  await page.clock.fastForward(270000 + 300);
  await page.reload();
  assert.equal(await page.locator('#window-focus-time').textContent(), '00:00');
  assert.deepEqual(await page.evaluate(() => readStats()), stats);
});

test('invalid saved timer is discarded and storage failures keep controls usable', async t => {
  const page = await openRoom(t);
  await page.evaluate(() => localStorage.setItem('lateNight.focusSession', JSON.stringify({minutes:999,phase:'focus',left:-1,endsAt:Infinity,done:false})));
  await page.reload();
  await page.locator('.mood[data-mood="focus"]').click();
  assert.equal(await page.locator('#focus-time').textContent(), '25:00');
  await page.evaluate(() => {
    Storage.prototype.setItem = function(key) { if (key.startsWith('lateNight.focus') || key === 'lateNight.intention' || key === 'lateNight.stats') throw new Error('quota'); };
  });
  await page.locator('#focus-intention').fill('Stay here');
  assert.match(await page.locator('#focus-intention-note').textContent(), /storage unavailable/);
  await page.locator('#focus-toggle').click();
  await page.clock.fastForward(1500000 + 300);
  assert.equal(await page.locator('#window-focus-time').textContent(), '00:00');
  assert.match(await page.locator('#focus-note').textContent(), /could not be saved/);
  await page.locator('#focus-reset').click();
  assert.equal(await page.locator('#focus-time').textContent(), '25:00');
});

test('focus orbit and quiet controls fit narrow and wide windows', async t => {
  for (const width of [320, 768, 1440]) {
    const page = await openRoom(t, width);
    await page.locator('.mood[data-mood="focus"]').click();
    await page.locator('#focus-intention').fill('A little reading before tomorrow');
    await page.locator('#window-focus-toggle').click();
    await page.clock.runFor(800);
    for (const quiet of [false, true]) {
      if (quiet) await page.locator('#quiet-room').click();
      const size = await page.evaluate(() => ({scroll:document.documentElement.scrollWidth, client:document.documentElement.clientWidth}));
      assert.ok(size.scroll <= size.client, `No horizontal overflow at ${width}`);
      const button = await page.locator('#window-focus-toggle').boundingBox();
      const glass = await page.locator('#window-outside').boundingBox();
      assert.ok(button.x >= glass.x && button.x + button.width <= glass.x + glass.width);
      assert.ok(button.y + button.height <= glass.y + glass.height, `Controls stay inside the glass at ${width}`);
      if (process.env.ATMOSPHERE_PREVIEW_DIR) await page.locator(quiet ? '.room' : '#window-view').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR, `focus-${width}-${quiet ? 'quiet' : 'room'}.png`)});
    }
    await page.close();
  }
});

test('completed focus controls remain tappable beside the lamp on a small phone', async t => {
  const page = await openRoom(t, 320);
  await page.locator('.mood[data-mood="focus"]').click();
  await page.locator('#focus-intention').fill('A longer intention wraps gently across the glass');
  await page.locator('#window-focus-toggle').click();
  await page.clock.fastForward(1500000 + 300);
  await page.locator('#window-focus [data-focus-break]').click();
  assert.equal(await page.locator('#window-focus-time').textContent(), '05:00');
  await page.locator('#window-focus [data-focus-break]').click();
  assert.equal(await page.locator('#window-focus-time').textContent(), '25:00');
  await page.locator('#desk-lamp').click();
  assert.equal(await page.locator('#desk-lamp').getAttribute('aria-pressed'), 'false');
});

test('the illustrated cat fits the sill without covering the cup or lamp', async t => {
  for (const width of [320, 768, 1440]) {
    const page = await openRoom(t, width);
    const cat = await page.locator('#window-cat').boundingBox();
    const cup = await page.locator('#window-cup').boundingBox();
    const lamp = await page.locator('#desk-lamp').boundingBox();
    assert.ok(cat.width >= 44 && cat.height >= 44);
    assert.ok(cat.x + cat.width < cup.x + 5, `Cat leaves room for the cup at ${width}`);
    assert.ok(cat.x >= lamp.x + lamp.width - 16, `Cat leaves room for the lamp at ${width}`);
    if (process.env.ATMOSPHERE_PREVIEW_DIR) await page.locator('#window-view').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR, `cat-${width}.png`)});
    await page.close();
  }
});

test('petting the cat works with the keyboard and leaves the tape and rain alone', async t => {
  const page = await openRoom(t);
  await page.locator('[data-evening="records"]').click();
  await page.clock.runFor(1500);
  const sounds = await page.evaluate(() => window.media.filter(a => !a.paused).map(a => a.src));
  await page.locator('#window-cat').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#window-cat').getAttribute('data-state'), 'content');
  assert.match(await page.locator('#cat-status').textContent(), /slow blink/);
  assert.deepEqual(await page.evaluate(() => window.media.filter(a => !a.paused).map(a => a.src)), sounds);
  await page.clock.runFor(5000);
  assert.equal(await page.locator('#window-cat').getAttribute('data-state'), 'asleep');
  assert.equal(await page.locator('#cat-status').textContent(), '');
});

test('cat motion respects reduced motion and petting catches up after a hidden tab', async t => {
  const page = await openRoom(t, 1280, 'no-preference');
  assert.equal(await page.locator('.cat-breath').evaluate(el => getComputedStyle(el).animationName), 'cat-breathing');
  await page.locator('#window-cat').click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable:true, value:true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await page.locator('.cat-breath').evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
  await page.clock.fastForward(6000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable:true, value:false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await page.locator('#window-cat').getAttribute('data-state'), 'asleep');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.cat-breath').evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.locator('#window-cat').click();
  assert.equal(await page.locator('#window-cat').getAttribute('data-state'), 'content');
});
