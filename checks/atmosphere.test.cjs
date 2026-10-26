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

test('glass sketches wipe real transparent paths into temporary mist and can be paused or cleared', async t => {
  const page = await openRoom(t);
  assert.equal(await page.locator('#glass-sketch').isVisible(),false);
  await page.locator('#glass-draw').click();
  await page.clock.runFor(50);
  assert.equal(await page.locator('#glass-draw').getAttribute('aria-pressed'),'true');
  const box = await page.locator('#glass-sketch').boundingBox();
  await page.mouse.move(box.x + box.width * .72,box.y + box.height * .65);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .82,box.y + box.height * .75,{steps:12});
  await page.mouse.up();
  await page.clock.runFor(50);
  assert.equal(await page.evaluate(() => glassStrokes.length),1);
  assert.ok(await page.evaluate(() => glassStrokes[0].points.length) > 1);
  assert.equal(await page.locator('#glass-sketch').evaluate(el => el.getContext('2d').getImageData(Math.round(el.width * .72),Math.round(el.height * .65),1,1).data[3]),0);
  assert.ok(await page.locator('#glass-sketch').evaluate(el => el.getContext('2d').getImageData(1,1,1,1).data[3]) > 0);
  await page.locator('#glass-draw').click();
  assert.equal(await page.locator('#glass-sketch').evaluate(el => getComputedStyle(el).pointerEvents),'none');
  assert.equal(await page.evaluate(() => glassStrokes.length),1);
  await page.locator('#glass-mist').click();
  assert.equal(await page.evaluate(() => glassStrokes.length),0);
  await page.locator('#glass-clear').click();
  assert.equal(await page.locator('#glass-sketch').isVisible(),false);
  assert.equal(await page.locator('#glass-draw').evaluate(el => el === document.activeElement),true);
});

test('midnight garden is a remembered fifth view that leaves the room and its sound intact', async t => {
  const page = await openRoom(t,1440);
  await page.locator('#evening-toggle').click();
  await page.clock.runFor(3000);
  await page.locator('#journal-note').fill('Leaves after midnight.');
  await page.evaluate(() => { window.gardenTape = tapeAudio; window.gardenRain = ambienceTrack; startFocus(); window.gardenFocus = focusEndsAt; });
  await page.locator('.view-switch button[data-view="garden"]').click();
  assert.equal(await page.locator('body').getAttribute('data-view'),'garden');
  assert.equal(await page.locator('#window-view').getAttribute('aria-label'),'Your midnight garden window');
  await page.locator('.garden-view').evaluate(el => el.getAnimations().forEach(animation => animation.finish()));
  assert.equal(await page.locator('.garden-view').evaluate(el => getComputedStyle(el).opacity),'1');
  assert.equal(await page.locator('.skyline').first().evaluate(el => getComputedStyle(el).opacity),'0');
  assert.equal(await page.locator('#journal-note').inputValue(),'Leaves after midnight.');
  assert.equal(await page.evaluate(() => tapeAudio === window.gardenTape && ambienceTrack === window.gardenRain && focusEndsAt === window.gardenFocus),true);
  if (process.env.ATMOSPHERE_PREVIEW_DIR) await page.locator('#window-view').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR,'midnight-garden-1440.png')});
  await page.reload();
  assert.equal(await page.locator('body').getAttribute('data-view'),'garden');
  assert.equal(await page.locator('.view-switch button[data-view="garden"]').getAttribute('aria-pressed'),'true');
});

test('garden controls and all seven evening cards fit phones, tablets and the quiet window', async t => {
  for (const width of [320,768,1440]) {
    const page = await openRoom(t,width);
    await page.locator('[data-evening="garden"]').click();
    await page.locator('#keep-evening').click();
    for (const card of await page.locator('.scene-card').all()) {
      const box = await card.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width);
    }
    for (const button of await page.locator('.view-switch button').all()) {
      const box = await button.boundingBox();
      const room = await page.locator('#window-view').boundingBox();
      assert.ok(box.x >= room.x && box.x + box.width <= room.x + room.width);
      assert.ok(box.height >= 36);
    }
    await page.locator('#garden-switch').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#garden-switch').getAttribute('aria-pressed'),'false');
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#garden-switch').getAttribute('aria-pressed'),'true');
    const sign = await page.locator('#garden-switch').boundingBox();
    const whisper = await page.locator('#window-whisper').boundingBox();
    assert.ok(sign.y + sign.height <= whisper.y);
    await page.locator('#garden-switch').blur();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    if (process.env.ATMOSPHERE_PREVIEW_DIR) {
      await page.locator('.scene-cards').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR,`garden-evenings-${width}.png`)});
      await page.locator('#window-view').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR,`garden-window-${width}.png`)});
    }
    await page.locator('#quiet-room').click();
    if (process.env.ATMOSPHERE_PREVIEW_DIR) await page.locator('#window-view').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR,`garden-quiet-${width}.png`)});
    await page.locator('#garden-switch').click();
    const box = await page.locator('#garden-switch').boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44 && box.x >= 0 && box.x + box.width <= width);
    assert.equal(await page.locator('#window-view').getAttribute('data-garden-light'),'false');
    await page.keyboard.press('Escape');
    await page.close();
  }
});

test('garden fireflies and pond follow weather, view visibility and reduced motion', async t => {
  const page = await openRoom(t,1280,'no-preference');
  await page.locator('.view-switch button[data-view="garden"]').click();
  const fly = page.locator('.garden-fireflies circle').first();
  const pond = page.locator('.garden-pond-rings');
  assert.equal(await fly.evaluate(el => getComputedStyle(el).animationName),'garden-drift');
  assert.equal(await fly.evaluate(el => getComputedStyle(el).animationPlayState),'running');
  assert.equal(await pond.evaluate(el => getComputedStyle(el).animationDuration),'16s');
  await page.locator('#music-rain').click();
  assert.equal(await pond.evaluate(el => getComputedStyle(el).animationDuration),'7s');
  await page.locator('.view-switch button[data-view="city"]').click();
  assert.equal(await fly.evaluate(el => getComputedStyle(el).animationPlayState),'paused');
  await page.locator('.view-switch button[data-view="garden"]').click();
  await page.evaluate(() => {
    Object.defineProperty(document,'hidden',{configurable:true,value:true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await fly.evaluate(el => getComputedStyle(el).animationPlayState),'paused');
  assert.equal(await pond.evaluate(el => getComputedStyle(el).animationPlayState),'paused');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await fly.evaluate(el => getComputedStyle(el).animationName),'none');
  assert.equal(await pond.evaluate(el => getComputedStyle(el).animationName),'none');
});

async function openGardenControls(page) {
  if (!await page.locator('#outside-sky').evaluate(el => el.open)) await page.locator('#outside-sky summary').click();
}

test('garden evening pairs a real tape and drizzle while its lights and fireflies remain independent', async t => {
  const page = await openRoom(t);
  await page.locator('[data-evening="garden"]').click();
  await page.clock.runFor(3000);
  assert.equal(await page.locator('body').getAttribute('data-view'),'garden');
  assert.equal(await page.locator('body').getAttribute('data-rain'),'drizzle');
  assert.equal(await page.locator('body').evaluate(el => el.classList.contains('has-rain')),true);
  assert.equal(await page.evaluate(() => tapeRunning && listening && !tapeAudio.paused && !ambienceTrack.paused),true);
  assert.equal(await page.locator('[data-evening="garden"]').getAttribute('aria-pressed'),'true');
  await page.evaluate(() => { window.gardenTape = tapeAudio; window.gardenRain = ambienceTrack; });
  await openGardenControls(page);
  await page.locator('#garden-flies').click();
  await page.locator('#garden-light').click();
  assert.equal(await page.locator('[data-evening="garden"]').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('#window-view').getAttribute('data-garden-flies'),'false');
  assert.equal(await page.locator('#garden-switch').getAttribute('aria-pressed'),'false');
  assert.equal(await page.evaluate(() => tapeAudio === window.gardenTape && ambienceTrack === window.gardenRain && !tapeAudio.paused && !ambienceTrack.paused),true);
  await page.locator('.view-switch button[data-view="cafe"]').click();
  assert.equal(await page.locator('#garden-switch').isVisible(),false);
  assert.equal(await page.locator('#garden-flies').isVisible(),false);
  await page.locator('.view-switch button[data-view="garden"]').click();
  assert.equal(await page.locator('#garden-light').getAttribute('aria-pressed'),'false');
  await page.reload();
  assert.equal(await page.locator('#window-view').getAttribute('data-garden-light'),'false');
  assert.equal(await page.locator('#window-view').getAttribute('data-garden-flies'),'false');
  assert.equal(await page.evaluate(() => tapeRunning),false);
  assert.equal(await page.evaluate(() => localStorage.getItem('lateNight.listen')),'1');
});

test('garden preferences restore in quick and collected evenings while legacy saves keep the current garden', async t => {
  const page = await openRoom(t);
  await page.locator('.view-switch button[data-view="garden"]').click();
  await openGardenControls(page);
  await page.locator('#garden-light').click();
  await page.locator('#garden-flies').click();
  await page.locator('#keep-evening').click();
  await collectRoom(page,'Moonlight in the garden');
  const quick = await page.evaluate(() => JSON.parse(localStorage.getItem('lateNight.personalScene')));
  assert.deepEqual(quick.garden,{light:false,flies:false});
  await page.evaluate(() => setGarden({light:true,flies:true}));
  assert.deepEqual(quick.garden,{light:false,flies:false});
  await page.locator('[data-evening="personal"]').click();
  assert.equal(await page.locator('#window-view').getAttribute('data-garden-flies'),'false');
  await page.evaluate(() => setGarden({light:true,flies:true}));
  await openEveningLibrary(page);
  await page.locator('.saved-evening-open').filter({hasText:'Moonlight in the garden'}).click();
  assert.equal(await page.locator('#window-view').getAttribute('data-garden-light'),'false');
  assert.equal(await page.locator('#window-view').getAttribute('data-garden-flies'),'false');
  assert.equal(await page.evaluate(() => window.media.some(a => !a.paused)),false);
  await page.evaluate(() => {
    const old = JSON.parse(localStorage.getItem('lateNight.personalScene'));
    delete old.garden;
    localStorage.setItem('lateNight.personalScene',JSON.stringify(old));
    setGarden({light:true,flies:false});
  });
  await page.reload();
  await page.locator('[data-evening="personal"]').click();
  assert.equal(await page.locator('#window-view').getAttribute('data-garden-light'),'true');
  assert.equal(await page.locator('#window-view').getAttribute('data-garden-flies'),'false');
});

test('malformed garden preferences and failed writes preserve stored data and leave controls usable', async t => {
  const page = await openRoom(t);
  for (const broken of ['{broken','{"light":"no","flies":false}','[true,false]']) {
    await page.evaluate(value => localStorage.setItem('lateNight.garden',value),broken);
    await page.reload();
    assert.equal(await page.locator('#window-view').getAttribute('data-garden-light'),'true');
    assert.equal(await page.locator('#window-view').getAttribute('data-garden-flies'),'true');
    assert.equal(await page.evaluate(() => localStorage.getItem('lateNight.garden')),broken);
  }
  await page.locator('.view-switch button[data-view="garden"]').click();
  await openGardenControls(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key,value) {
      if (key === 'lateNight.garden') throw new DOMException('full','QuotaExceededError');
      return original.call(this,key,value);
    };
  });
  await page.locator('#garden-light').click();
  assert.equal(await page.locator('#window-view').getAttribute('data-garden-light'),'false');
  assert.match(await page.locator('#garden-status').textContent(),/Couldn't remember/);
  await page.locator('#garden-flies').click();
  assert.equal(await page.locator('#window-view').getAttribute('data-garden-flies'),'false');
  assert.equal(await page.evaluate(() => localStorage.getItem('lateNight.garden')),'[true,false]');
});

test('paper lantern notes are literal, temporary and absent from saved room data', async t => {
  const page = await openRoom(t);
  const thought = '<img src=x onerror=alert(1)> let go';
  await page.locator('#lantern-thought').fill(thought);
  await page.locator('#lantern-release').click();
  assert.equal(await page.locator('.paper-lantern').count(),1);
  assert.equal(await page.locator('.lantern-message').textContent(),thought);
  assert.equal(await page.locator('#sky-lanterns img').count(),0);
  assert.equal(await page.locator('#lantern-thought').inputValue(),'');
  assert.equal(await page.locator('#window-view').evaluate(el => el === document.activeElement),true);
  await page.locator('#keep-evening').click();
  await collectRoom(page,'A passing light');
  assert.equal(await page.evaluate(value => JSON.stringify(localStorage).includes(value),thought),false);
  assert.equal(await page.evaluate(() => window.media.some(a => !a.paused)),false);
  await page.clock.fastForward(31000);
  assert.equal(await page.locator('.paper-lantern').count(),0);
  assert.equal(await page.locator('#lantern-clear').isVisible(),false);
  assert.match(await page.locator('#lantern-note').textContent(),/notes are gone/);
});

test('lantern capacity, draft retention and clearing work with the quiet-window keyboard button', async t => {
  const page = await openRoom(t);
  await page.locator('#quiet-room').click();
  const button = page.locator('#window-lantern');
  await button.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.paper-lantern').count(),3);
  assert.equal(await button.isDisabled(),true);
  await page.keyboard.press('Escape');
  await page.locator('#lantern-thought').fill('Keep this draft');
  await page.evaluate(() => document.getElementById('lantern-form').requestSubmit());
  assert.equal(await page.locator('#lantern-thought').inputValue(),'Keep this draft');
  assert.equal(await page.locator('.paper-lantern').count(),3);
  await page.locator('#lantern-clear').click();
  assert.equal(await page.locator('.paper-lantern').count(),0);
  assert.equal(await button.isDisabled(),false);
  assert.equal(await page.locator('#lantern-release').evaluate(el => el === document.activeElement),true);
  assert.equal(await page.locator('#lantern-thought').inputValue(),'Keep this draft');
});

test('lantern motion pauses in hidden tabs and expired notes vanish when the room wakes', async t => {
  const page = await openRoom(t,1280,'no-preference');
  await page.locator('#window-lantern').click();
  assert.equal(await page.locator('.paper-lantern').evaluate(el => getComputedStyle(el).animationName),'lanternFlight');
  await page.evaluate(() => { Object.defineProperty(document,'hidden',{configurable:true,value:true}); document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(await page.locator('.paper-lantern').evaluate(el => getComputedStyle(el).animationPlayState),'paused');
  assert.equal(await page.evaluate(() => lanternExpiryTick),null);
  await page.clock.fastForward(31000);
  await page.evaluate(() => { Object.defineProperty(document,'hidden',{configurable:true,value:false}); document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(await page.locator('.paper-lantern').count(),0);
  assert.equal(await page.evaluate(() => lanternExpiryTick),null);
  assert.equal(await page.locator('#window-lantern').isDisabled(),false);
});

test('lantern colours persist and restore from quick saves and collected rooms without launching flights', async t => {
  const page = await openRoom(t);
  await page.locator('button[data-lantern-tone="rose"]').click();
  await page.locator('#keep-evening').click();
  await collectRoom(page,'Rose lights');
  await page.locator('button[data-lantern-tone="moon"]').click();
  await page.reload();
  assert.equal(await page.locator('button[data-lantern-tone="moon"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-evening="personal"]').click();
  assert.equal(await page.locator('button[data-lantern-tone="rose"]').getAttribute('aria-pressed'),'true');
  await page.locator('button[data-lantern-tone="amber"]').click();
  await openEveningLibrary(page);
  await page.locator('.saved-evening-open').click();
  assert.equal(await page.locator('button[data-lantern-tone="rose"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.paper-lantern').count(),0);
  await page.evaluate(() => { const old = JSON.parse(localStorage.getItem('lateNight.personalScene')); delete old.lanternTone; localStorage.setItem('lateNight.personalScene',JSON.stringify(old)); });
  await page.reload();
  await page.locator('button[data-lantern-tone="moon"]').click();
  await page.locator('[data-evening="personal"]').click();
  assert.equal(await page.locator('button[data-lantern-tone="moon"]').getAttribute('aria-pressed'),'true');
});

test('invalid lantern preferences and colour storage failures keep the ritual usable', async t => {
  const page = await openRoom(t);
  await page.evaluate(() => localStorage.setItem('lateNight.lanternTone','unknown'));
  await page.reload();
  assert.equal(await page.locator('button[data-lantern-tone="amber"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(() => localStorage.getItem('lateNight.lanternTone')),'unknown');
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key,value) { if (key === 'lateNight.lanternTone') throw new Error('quota'); return original.call(this,key,value); }; });
  await page.locator('button[data-lantern-tone="moon"]').click();
  assert.match(await page.locator('#lantern-note').textContent(),/Couldn't save/);
  await page.locator('#window-lantern').click();
  assert.equal(await page.locator('.paper-lantern').getAttribute('data-tone'),'moon');
  await page.reload();
  assert.equal(await page.locator('.paper-lantern').count(),0);
  assert.equal(await page.locator('#lantern-thought').inputValue(),'');
});

test('lanterns fit phones and desktop without replacing music, rain or the running focus clock', async t => {
  for (const width of [320,768,1440]) {
    const page = await openRoom(t,width);
    await page.locator('#evening-toggle').click();
    await page.clock.runFor(3000);
    await page.evaluate(() => { window.beforeLanternTape = tapeAudio; window.beforeLanternRain = ambienceTrack; startFocus(); window.beforeLanternFocus = focusEndsAt; });
    await page.locator('#lantern-thought').fill('The rest can wait.');
    await page.locator('#lantern-release').click();
    await page.locator('button[data-lantern-tone="rose"]').click();
    await page.locator('#window-lantern').click();
    assert.equal(await page.evaluate(() => tapeAudio === window.beforeLanternTape && ambienceTrack === window.beforeLanternRain && focusEndsAt === window.beforeLanternFocus),true);
    assert.equal(await page.locator('.paper-lantern').first().evaluate(el => getComputedStyle(el).animationName),'none');
    assert.equal(await page.locator('#sky-lanterns').evaluate(el => getComputedStyle(el).pointerEvents),'none');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    const button = await page.locator('#window-lantern').boundingBox();
    const pull = await page.locator('#curtain-pull').boundingBox();
    assert.ok(button.width >= 44 && button.height >= 44 && button.x >= 0 && button.x + button.width <= width);
    assert.ok(button.y >= pull.y + pull.height);
    await page.locator('#quiet-room').click();
    await page.locator('#window-lantern').click();
    assert.equal(await page.locator('.paper-lantern').count(),3);
    if (process.env.ATMOSPHERE_PREVIEW_DIR) await page.locator('#window-view').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR,`lantern-window-${width}.png`)});
    await page.keyboard.press('Escape');
    if (process.env.ATMOSPHERE_PREVIEW_DIR) await page.locator('#lantern-room').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR,`lantern-controls-${width}.png`)});
    await page.close();
  }
});

async function openEveningLibrary(page) {
  if (!await page.locator('#evening-library').evaluate(el => el.open)) await page.locator('#evening-library summary').click();
  await page.locator('#library-name').waitFor({state:'visible'});
}
async function collectRoom(page,name) {
  await openEveningLibrary(page);
  await page.locator('#library-name').fill(name);
  await page.locator('#library-save').click();
}

test('collected evenings save distinct rooms quietly and restore complete settings without replacing the quick save', async t => {
  const page = await openRoom(t);
  await page.locator('#journal-note').fill('The room is mine.');
  await page.locator('#keep-evening').click();
  const quickSave = await page.evaluate(() => localStorage.getItem('lateNight.personalScene'));
  await page.locator('.view-switch button[data-view="coast"]').click();
  await page.locator('button[data-ambient="ocean"]').click();
  await page.locator('button[data-fabric="plum"]').click();
  await page.locator('#curtain-amount').fill('67');
  await page.locator('#light-brightness').fill('32');
  await collectRoom(page,'  Sea before sleep  ');
  assert.equal(await page.evaluate(() => window.media.some(a => !a.paused)),false);
  await page.locator('.view-switch button[data-view="mountains"]').click();
  await page.locator('button[data-ambient="fire"]').click();
  await collectRoom(page,'Mountain records');
  assert.equal(await page.locator('.saved-evening').count(),2);
  await page.reload();
  await openEveningLibrary(page);
  await page.locator('.saved-evening-open').filter({hasText:'Sea before sleep'}).click();
  assert.equal(await page.locator('body').getAttribute('data-view'),'coast');
  assert.equal(await page.locator('body').getAttribute('data-ambient'),'ocean');
  assert.equal(await page.locator('#window-view').getAttribute('data-curtains'),'67');
  assert.equal(await page.locator('#window-view').getAttribute('data-fabric'),'plum');
  assert.equal(await page.locator('#light-brightness').inputValue(),'32');
  assert.equal(await page.locator('#journal-note').inputValue(),'The room is mine.');
  assert.equal(await page.locator('#listen').getAttribute('aria-pressed'),'false');
  assert.equal(await page.evaluate(() => localStorage.getItem('lateNight.personalScene')),quickSave);
});

test('collected room opening restores active sound intent while saving and managing names stay quiet', async t => {
  const page = await openRoom(t);
  await page.locator('#evening-toggle').click();
  await page.clock.runFor(3000);
  await page.evaluate(() => { window.collectionTape = tapeAudio; window.collectionRain = ambienceTrack; });
  await collectRoom(page,'Rain in the city');
  assert.equal(await page.evaluate(() => tapeAudio === window.collectionTape && ambienceTrack === window.collectionRain),true);
  await page.locator('#evening-toggle').click();
  await page.clock.runFor(1600);
  await page.locator('.saved-evening-open').click();
  await page.clock.runFor(3000);
  assert.equal(await page.evaluate(() => tapeRunning && listening),true);
  await page.locator('[data-library-action="rename"]').click();
  await page.locator('.library-rename input').fill('A quieter city');
  await page.locator('.library-rename button[type="submit"]').click();
  assert.equal(await page.evaluate(() => tapeAudio === window.collectionTape && ambienceTrack === window.collectionRain),true);
  assert.equal(await page.locator('.saved-evening-open strong').textContent(),'A quieter city');
});

test('collected evening names are literal text and renaming supports Escape, Enter and keyboard focus', async t => {
  const page = await openRoom(t);
  const literal = '<img src=x onerror=alert(1)>';
  await collectRoom(page,literal);
  assert.equal(await page.locator('.saved-evening-open strong').textContent(),literal);
  assert.equal(await page.locator('#library-grid img').count(),0);
  const rename = page.locator('[data-library-action="rename"]');
  await rename.focus();
  await page.keyboard.press('Enter');
  await page.locator('.library-rename input').fill('Not yet');
  await page.keyboard.press('Escape');
  assert.equal(await rename.evaluate(el => el === document.activeElement),true);
  assert.equal(await page.locator('.saved-evening-open strong').textContent(),literal);
  await rename.click();
  assert.equal(await page.locator('.library-rename input').inputValue(),literal);
  await page.locator('.library-rename input').fill('Window number 1');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.saved-evening-open strong').textContent(),'Window number 1');
  assert.equal(await page.locator('[data-library-action="rename"]').evaluate(el => el === document.activeElement),true);
  await page.locator('#evening-library summary').focus();
  await page.keyboard.press('1');
  assert.equal(await page.locator('body').getAttribute('data-mood'),'music');
});

test('eight collected rooms can be removed and restored without overwriting rooms added in another tab', async t => {
  const page = await openRoom(t);
  await page.evaluate(() => localStorage.setItem('lateNight.evenings',JSON.stringify({version:1,items:Array.from({length:8},(_,i) => ({id:`room-${i}`,name:`Room ${i}`,scene:captureEvening()}))})));
  await openEveningLibrary(page);
  assert.equal(await page.locator('.saved-evening').count(),8);
  assert.equal(await page.locator('#library-save').isDisabled(),true);
  await page.locator('[data-library-action="remove"]').first().click();
  assert.equal(await page.locator('.saved-evening').count(),7);
  assert.equal(await page.locator('#library-save').isDisabled(),false);
  await page.evaluate(() => { const value = JSON.parse(localStorage.getItem('lateNight.evenings')); value.items.push({id:'another-tab',name:'Another tab',scene:captureEvening()}); localStorage.setItem('lateNight.evenings',JSON.stringify(value)); });
  await page.locator('#library-undo').click();
  assert.match(await page.locator('#library-status').textContent(),/collection is full/);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lateNight.evenings')).items.length),8);
  await page.locator('[data-library-action="remove"]').first().click();
  await page.locator('#library-undo').click();
  assert.equal(await page.locator('.saved-evening').count(),8);
  assert.equal(await page.locator('#library-undo').isVisible(),false);
  assert.equal(await page.evaluate(() => window.media.some(a => !a.paused)),false);
});

test('unreadable evening collections are preserved and failed writes keep the previous rooms and name draft', async t => {
  const page = await openRoom(t);
  await collectRoom(page,'One quiet room');
  const stored = await page.evaluate(() => localStorage.getItem('lateNight.evenings'));
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key,value) { if (key === 'lateNight.evenings') throw new Error('quota'); return original.call(this,key,value); }; });
  await collectRoom(page,'Still a draft');
  assert.equal(await page.locator('#library-name').inputValue(),'Still a draft');
  assert.match(await page.locator('#library-status').textContent(),/Couldn't save/);
  assert.equal(await page.evaluate(() => localStorage.getItem('lateNight.evenings')),stored);
  await page.reload();
  await page.evaluate(() => localStorage.setItem('lateNight.evenings','{broken'));
  await page.reload();
  await openEveningLibrary(page);
  assert.equal(await page.locator('#library-save').isDisabled(),true);
  assert.match(await page.locator('#library-status').textContent(),/Couldn't read/);
  assert.equal(await page.evaluate(() => localStorage.getItem('lateNight.evenings')),'{broken');
  await page.evaluate(value => { localStorage.setItem('lateNight.evenings',value); window.dispatchEvent(new StorageEvent('storage',{key:'lateNight.evenings'})); },stored);
  assert.equal(await page.locator('.saved-evening').count(),1);
  assert.equal(await page.locator('#library-save').isDisabled(),false);
});

test('illustrated evening collection fits phones and desktop with long names and accessible card actions', async t => {
  for (const width of [320,768,1440]) {
    const page = await openRoom(t,width);
    await collectRoom(page,'Rain and records');
    await page.locator('.view-switch button[data-view="coast"]').click();
    await page.locator('button[data-ambient="ocean"]').click();
    await collectRoom(page,'A'.repeat(40));
    await page.locator('.view-switch button[data-view="mountains"]').click();
    await collectRoom(page,'A mountain hideaway');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    for (const button of await page.locator('.saved-evening button').all()) {
      if (!await button.isVisible()) continue;
      const box = await button.boundingBox();
      assert.ok(box.height >= 44 && box.width >= 44 && box.x >= 0 && box.x + box.width <= width);
    }
    await page.locator('[data-library-action="remove"]').first().click();
    await page.locator('#library-undo').click();
    assert.equal(await page.locator('.saved-evening-open').first().evaluate(el => el === document.activeElement),true);
    if (process.env.ATMOSPHERE_PREVIEW_DIR) {
      const coast = page.locator('.saved-evening').nth(1);
      await coast.locator('[data-library-action="rename"]').click();
      await coast.locator('.library-rename input').fill('The quiet coast');
      await coast.locator('.library-rename button[type="submit"]').click();
      await page.locator('#evening-library').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR,`evening-library-${width}.png`)});
    }
    await page.close();
  }
});

test('curtain folds and fabrics persist without starting or replacing room audio', async t => {
  const page = await openRoom(t);
  await page.locator('#evening-toggle').click();
  await page.clock.runFor(3000);
  await page.evaluate(() => { window.curtainTape = tapeAudio; window.curtainRain = ambienceTrack; });
  await page.locator('button[data-fabric="plum"]').click();
  await page.locator('#curtain-amount').fill('63');
  assert.equal(await page.locator('#window-view').getAttribute('data-curtains'),'63');
  assert.equal(await page.locator('#curtain-level').textContent(),'63%');
  assert.equal(await page.locator('#curtain-amount').getAttribute('aria-valuetext'),'63 percent drawn');
  assert.equal(await page.evaluate(() => tapeAudio === window.curtainTape && ambienceTrack === window.curtainRain && !tapeAudio.paused && !ambienceTrack.paused),true);
  await page.locator('[data-station="radio"]').click();
  await page.locator('#radio-frame iframe').evaluate(el => { el.dataset.curtainKept = 'yes'; });
  await page.locator('button[data-curtain="0"]').click();
  assert.equal(await page.locator('#radio-frame iframe').getAttribute('data-curtain-kept'),'yes');
  await page.reload();
  assert.equal(await page.locator('#window-view').getAttribute('data-curtains'),'0');
  assert.equal(await page.locator('#window-view').getAttribute('data-fabric'),'plum');
  assert.equal(await page.evaluate(() => tapeRunning),false);
});

test('window curtain pull cycles positions with the keyboard in quiet mode and leaves focus running', async t => {
  const page = await openRoom(t);
  await page.locator('.mood[data-mood="focus"]').click();
  await page.locator('#focus-toggle').click();
  await page.locator('#quiet-room').click();
  const deadline = await page.evaluate(() => focusEndsAt);
  const pull = page.locator('#curtain-pull');
  await pull.focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#window-view').getAttribute('data-curtains'),'100');
  assert.match(await pull.getAttribute('aria-label'),/^Open.*100 percent/);
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#window-view').getAttribute('data-curtains'),'0');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#window-view').getAttribute('data-curtains'),'25');
  assert.equal(await page.evaluate(() => focusEndsAt),deadline);
  assert.equal(await pull.evaluate(el => el === document.activeElement),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#quiet-room').getAttribute('aria-pressed'),'false');
});

test('personal evening remembers curtain details and older scenes keep the current fabric', async t => {
  const page = await openRoom(t);
  await page.locator('button[data-fabric="plum"]').click();
  await page.locator('#curtain-amount').fill('63');
  await page.locator('#keep-evening').click();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('lateNight.personalScene')).curtains),{amount:63,fabric:'plum'});
  await page.locator('[data-evening="lastlight"]').click();
  assert.equal(await page.locator('#window-view').getAttribute('data-curtains'),'100');
  assert.equal(await page.locator('#window-view').getAttribute('data-fabric'),'ink');
  await page.locator('[data-evening="personal"]').click();
  assert.equal(await page.locator('#window-view').getAttribute('data-curtains'),'63');
  assert.equal(await page.locator('#window-view').getAttribute('data-fabric'),'plum');
  assert.equal(await page.locator('#listen').getAttribute('aria-pressed'),'false');
  await page.locator('button[data-curtain="0"]').click();
  assert.equal(await page.locator('[data-evening="personal"]').getAttribute('aria-pressed'),'false');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('lateNight.personalScene')); delete s.curtains; localStorage.setItem('lateNight.personalScene',JSON.stringify(s)); });
  await page.reload();
  await page.locator('button[data-fabric="ink"]').click();
  await page.locator('#curtain-amount').fill('42');
  await page.locator('[data-evening="personal"]').click();
  assert.equal(await page.locator('#window-view').getAttribute('data-curtains'),'42');
  assert.equal(await page.locator('#window-view').getAttribute('data-fabric'),'ink');
});

test('curtains preserve malformed saved data and remain usable when storage fails', async t => {
  const page = await openRoom(t);
  for (const stored of ['{broken','{"amount":999,"fabric":"ink"}','{"amount":50,"fabric":"unknown"}']) {
    await page.evaluate(value => localStorage.setItem('lateNight.curtains',value),stored);
    await page.reload();
    assert.equal(await page.locator('#window-view').getAttribute('data-curtains'),'25');
    assert.equal(await page.evaluate(() => localStorage.getItem('lateNight.curtains')),stored);
  }
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key,value) { if (key === 'lateNight.curtains') throw new Error('quota'); return original.call(this,key,value); }; });
  await page.locator('button[data-curtain="100"]').click();
  assert.equal(await page.locator('#window-view').getAttribute('data-curtains'),'100');
  assert.match(await page.locator('#curtain-note').textContent(),/Couldn't save/);
  assert.equal(await page.evaluate(() => window.media.some(a => !a.paused)),false);
});

test('curtain cloth fits every view and the pull stays reachable on phones and desktop', async t => {
  for (const width of [320,768,1440]) {
    const page = await openRoom(t,width);
    await page.locator('button[data-curtain="100"]').click();
    for (const view of ['city','mountains','coast','cafe']) {
      await page.locator(`.view-switch button[data-view="${view}"]`).click();
      const glass = await page.locator('#window-outside').boundingBox();
      const panel = await page.locator('.curtain-left').boundingBox();
      assert.ok(panel.width > 0 && panel.width < glass.width * .32);
      assert.ok(await page.locator('.curtain-left').evaluate(el => getComputedStyle(el).transitionDuration.split(',').every(value => parseFloat(value) < .001)));
      assert.equal(await page.locator('.window-curtains').evaluate(el => getComputedStyle(el).pointerEvents),'none');
      if (view === 'cafe') {
        const sign = await page.locator('#cafe-sign').boundingBox();
        const rightCloth = await page.locator('.curtain-right').boundingBox();
        assert.ok(sign.x >= panel.x + panel.width && sign.x + sign.width <= rightCloth.x);
        const whisper = await page.locator('#window-whisper').boundingBox();
        assert.ok(sign.y >= whisper.y + whisper.height);
      }
      await page.locator('#curtain-pull').click();
      await page.locator('#curtain-pull').click();
      await page.locator('#curtain-pull').click();
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    const pull = await page.locator('#curtain-pull').boundingBox();
    assert.ok(pull.width >= 44 && pull.x >= 0 && pull.x + pull.width <= width);
    await page.locator('#curtain-amount').focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('#curtain-level').textContent(),'99%');
    if (process.env.ATMOSPHERE_PREVIEW_DIR) await page.locator('#window-view').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR,`curtain-shelter-${width}.png`)});
    await page.locator('button[data-curtain="25"]').click();
    if (process.env.ATMOSPHERE_PREVIEW_DIR) {
      await page.locator('#window-view').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR,`curtain-room-${width}.png`)});
      await page.locator('#room-curtains').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR,`curtain-controls-${width}.png`)});
    }
    await page.close();
  }
});

test('sound shelf cues recordings without autoplay and keeps a chosen background across moods', async t => {
  const page = await openRoom(t);
  await page.locator('button[data-ambient="ocean"]').click();
  assert.equal(await page.evaluate(() => window.media.some(a => !a.paused)),false);
  assert.match(await page.locator('#ambience-name').textContent(),/gentle ocean.*ready/);
  await page.locator('#listen').click();
  await page.clock.runFor(1600);
  assert.match(await page.evaluate(() => ambienceTrack.src),/Gentle%20Ocean/);
  await page.locator('.mood[data-mood="focus"]').click();
  assert.match(await page.evaluate(() => ambienceTrack.src),/Gentle%20Ocean/);
  assert.equal(await page.locator('button[data-ambient="ocean"]').getAttribute('aria-pressed'),'true');
  await page.locator('button[data-ambient="auto"]').click();
  assert.match(await page.evaluate(() => ambienceTrack.src),/FIRE/);
  await page.locator('#listen').click();
  await page.clock.runFor(800);
  await page.locator('button[data-ambient="space"]').click();
  assert.equal(await page.evaluate(() => window.media.some(a => !a.paused)),false);
  await page.reload();
  assert.equal(await page.locator('body').getAttribute('data-ambient'),'space');
  assert.equal(await page.locator('#listen').getAttribute('aria-pressed'),'false');
  assert.match(await page.locator('#ambient-source').getAttribute('href'),/opengameart.org/);
});

test('window playback respects the chosen ocean and leaves clear weather alone', async t => {
  const page = await openRoom(t);
  await page.locator('button[data-ambient="ocean"]').click();
  assert.match(await page.locator('#evening-toggle').textContent(),/lo-fi \+ ocean/);
  await page.locator('#evening-toggle').click();
  await page.clock.runFor(3000);
  assert.equal(await page.locator('body').evaluate(el => el.classList.contains('has-rain')),false);
  assert.equal(await page.evaluate(() => window.media.filter(a => !a.paused).length),2);
  await page.evaluate(() => { window.keptTape = tapeAudio; });
  await page.locator('button[data-ambient="fire"]').click();
  await page.clock.runFor(1600);
  assert.equal(await page.evaluate(() => tapeAudio === window.keptTape && !tapeAudio.paused),true);
  assert.match(await page.evaluate(() => ambienceTrack.src),/FIRE/);
  assert.match(await page.locator('#ambient-source').getAttribute('href'),/archive.org\/details\/relaxingsounds$/);
  await page.locator('#evening-toggle').click();
  await page.clock.runFor(1600);
  assert.equal(await page.evaluate(() => window.media.some(a => !a.paused)),false);
});

test('independent rain has an intensity dial without changing the sky and legacy rain control returns to auto', async t => {
  const page = await openRoom(t);
  await page.locator('button[data-ambient="rain"]').click();
  assert.equal(await page.locator('#rain-dial').isVisible(),true);
  await page.locator('#listen').click();
  await page.locator('[data-rain="downpour"]').click();
  await page.clock.runFor(1600);
  assert.match(await page.evaluate(() => ambienceTrack.src),/Thunderstorm/);
  assert.equal(await page.locator('body').evaluate(el => el.classList.contains('has-rain')),false);
  await page.locator('#music-rain').click();
  assert.equal(await page.locator('body').getAttribute('data-ambient'),'auto');
  assert.equal(await page.locator('body').evaluate(el => el.classList.contains('has-rain')),true);
});

test('personal evenings restore chosen backgrounds while ready-made and older scenes follow their moods', async t => {
  const page = await openRoom(t);
  await page.locator('button[data-ambient="fire"]').click();
  await page.locator('#keep-evening').click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lateNight.personalScene')).ambientChoice),'fire');
  assert.match(await page.locator('#personal-recipe').textContent(),/fireplace sound/);
  await page.locator('[data-evening="harbour"]').click();
  assert.equal(await page.locator('body').getAttribute('data-ambient'),'auto');
  assert.match(await page.evaluate(() => ambienceTrack.src),/Ocean/);
  await page.locator('[data-evening="personal"]').click();
  assert.equal(await page.locator('body').getAttribute('data-ambient'),'fire');
  assert.equal(await page.locator('#listen').getAttribute('aria-pressed'),'false');
  await page.locator('button[data-ambient="ocean"]').click();
  assert.equal(await page.locator('[data-evening="personal"]').getAttribute('aria-pressed'),'false');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('lateNight.personalScene')); delete s.ambientChoice; localStorage.setItem('lateNight.personalScene',JSON.stringify(s)); });
  await page.reload();
  await page.locator('[data-evening="personal"]').click();
  assert.equal(await page.locator('body').getAttribute('data-ambient'),'auto');
});

test('changing ambient cards preserves radio and ignores failures belonging to the previous sound', async t => {
  const page = await openRoom(t);
  await page.locator('[data-station="radio"]').click();
  await page.locator('#radio-frame iframe').evaluate(el => { el.dataset.kept = 'yes'; });
  await page.evaluate(() => { window.deferAudio = true; });
  await page.locator('button[data-ambient="rain"]').click();
  await page.locator('#listen').click();
  await page.evaluate(() => { window.oldAmbient = ambienceTrack; window.deferAudio = false; });
  await page.locator('button[data-ambient="ocean"]').click();
  await page.evaluate(() => window.oldAmbient.rejectPlay(new Error('late failure')));
  assert.equal(await page.locator('#listen').textContent(),'listening');
  assert.equal(await page.locator('#radio-frame iframe').getAttribute('data-kept'),'yes');
  await page.evaluate(() => { window.failAudio = true; });
  await page.locator('button[data-ambient="fire"]').click();
  await page.waitForFunction(() => document.getElementById('listen').textContent === 'retry');
  assert.equal(await page.locator('#sound-shelf').evaluate(el => el.classList.contains('is-playing')),false);
  await page.evaluate(() => { window.failAudio = false; });
  await page.locator('#listen').click();
  assert.match(await page.evaluate(() => ambienceTrack.src),/FIRE/);
});

test('sound shelf respects device storage failures, invalid preferences and the evening deadline', async t => {
  const page = await openRoom(t);
  await page.evaluate(() => localStorage.setItem('lateNight.ambientChoice','unknown'));
  await page.reload();
  assert.equal(await page.locator('body').getAttribute('data-ambient'),'auto');
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key,value) { if (key === 'lateNight.ambientChoice') throw new Error('quota'); return original.call(this,key,value); }; });
  await page.locator('button[data-ambient="ocean"]').click();
  assert.match(await page.locator('#sound-choice-note').textContent(),/Couldn't save/);
  await page.locator('#listen').click();
  await page.locator('[data-sound-minutes="15"]').click();
  await page.locator('#sound-timer-start').click();
  await page.clock.fastForward(15 * 60 * 1000 + 1000);
  assert.equal(await page.evaluate(() => ambienceTrack.paused),true);
  assert.equal(await page.locator('#listen').getAttribute('aria-pressed'),'false');
});

test('illustrated sound cards fit narrow phones and support keyboard selection without motion', async t => {
  for (const width of [320,768,1440]) {
    const page = await openRoom(t,width);
    const choice = page.locator('button[data-ambient="ocean"]');
    await choice.focus();
    await page.keyboard.press('Space');
    assert.equal(await choice.getAttribute('aria-pressed'),'true');
    assert.equal(await choice.evaluate(el => el === document.activeElement),true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    for (const card of await page.locator('.sound-choices button').all()) {
      const box = await card.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44 && box.x >= 0 && box.x + box.width <= width);
    }
    await page.locator('#listen').click();
    assert.equal(await page.locator('.sound-waves').evaluate(el => getComputedStyle(el).animationName),'none');
    if (process.env.ATMOSPHERE_PREVIEW_DIR) await page.locator('#sound-shelf').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR,`sound-shelf-${width}.png`)});
    await page.close();
  }
});

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
  assert.equal(await page.evaluate(() => typeof audioCtx), 'undefined');
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
 assert.equal(await page.evaluate(() => typeof buildSynth), 'undefined');
 assert.equal(await page.evaluate(() => tapeAudio.src), src);
 assert.equal(await page.evaluate(() => typeof audioCtx), 'undefined');
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
  // Keep navigation time from consuming an extra second at the break boundary.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
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

test('cat coats and solitude persist and storage failures leave the current choice usable', async t => {
  const page = await openRoom(t, 320);
  await page.locator('#window-company summary').click();
  await page.locator('button[data-cat-coat="ink"]').click();
  assert.equal(await page.locator('#window-cat').getAttribute('data-coat'), 'ink');
  await page.locator('#cat-toggle').click();
  assert.equal(await page.locator('#window-cat').isVisible(), false);
  await page.reload();
  assert.equal(await page.locator('#window-cat').isVisible(), false);
  assert.equal(await page.locator('#window-cat').getAttribute('data-coat'), 'ink');
  await page.locator('#window-company summary').click();
  await page.locator('#cat-toggle').click();
  await page.locator('button[data-cat-coat="moon"]').click();
  assert.equal(await page.locator('#window-cat').isVisible(), true);
  assert.equal(await page.locator('button[data-cat-coat="moon"]').getAttribute('aria-pressed'), 'true');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key,value) { if (key === 'lateNight.cat') throw new Error('quota'); return original.call(this,key,value); };
  });
  await page.locator('button[data-cat-coat="ginger"]').click();
  assert.equal(await page.locator('#window-cat').getAttribute('data-coat'), 'ginger');
  assert.match(await page.locator('#cat-settings-note').textContent(), /storage unavailable/);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lateNight.cat')).coat), 'moon');
});

test('personal evenings restore cat settings and older evenings leave company alone', async t => {
  const page = await openRoom(t);
  await page.locator('#window-company summary').click();
  await page.locator('button[data-cat-coat="moon"]').click();
  await page.locator('#cat-toggle').click();
  await page.locator('#keep-evening').click();
  assert.match(await page.locator('#personal-recipe').textContent(), /solitude/);
  await page.locator('#cat-toggle').click();
  assert.equal(await page.locator('[data-evening="personal"]').getAttribute('aria-pressed'), 'false');
  await page.locator('button[data-cat-coat="ink"]').click();
  await page.locator('[data-evening="personal"]').click();
  assert.equal(await page.locator('#window-cat').isVisible(), false);
  assert.equal(await page.locator('#window-cat').getAttribute('data-coat'), 'moon');
  await page.evaluate(() => {
    const older = JSON.parse(localStorage.getItem('lateNight.personalScene'));
    delete older.cat;
    localStorage.setItem('lateNight.personalScene', JSON.stringify(older));
    localStorage.setItem('lateNight.cat', JSON.stringify({coat:'ink',present:true}));
  });
  await page.reload();
  await page.locator('[data-evening="personal"]').click();
  assert.equal(await page.locator('#window-cat').isVisible(), true);
  assert.equal(await page.locator('#window-cat').getAttribute('data-coat'), 'ink');
});

test('window company survives quiet mode, view changes and an ongoing focus session', async t => {
  const page = await openRoom(t);
  await page.locator('.mood[data-mood="focus"]').click();
  await page.locator('#focus-toggle').click();
  await page.locator('#quiet-room').click();
  await page.locator('#window-cat').click();
  await page.clock.runFor(2000);
  assert.equal(await page.locator('#window-focus-time').textContent(), '24:58');
  await page.locator('button[data-view="coast"]').click();
  assert.equal(await page.locator('#window-cat').getAttribute('data-state'), 'content');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.room-desk').isVisible(), true);
  assert.equal(await page.locator('#focus-toggle').textContent(), 'pause');
});

test('company controls and all coats fit a phone and cat stays reachable after focus', async t => {
  for (const width of [320, 768, 1440]) {
    const page = await openRoom(t, width);
    await page.locator('#window-company summary').click();
    for (const coat of ['ginger','ink','moon']) {
      await page.locator(`button[data-cat-coat="${coat}"]`).click();
      await page.locator('#window-cat').click();
      assert.ok(await page.locator('#window-cat').isVisible());
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
      if (process.env.ATMOSPHERE_PREVIEW_DIR && width === 1440) await page.locator('#window-view').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR, `cat-coat-${coat}.png`)});
    }
    if (width === 320) {
      await page.locator('.mood[data-mood="focus"]').click();
      await page.locator('#focus-intention').fill('A long quiet task for the evening');
      await page.locator('#focus-toggle').click();
      await page.clock.fastForward(1500000 + 300);
      await page.locator('#window-cat').click({timeout:3000});
      assert.equal(await page.locator('#window-cat').getAttribute('data-state'), 'content');
    }
    await page.close();
  }
});

test('corrupted cat preferences fall back safely without replacing the saved data', async t => {
  const page = await openRoom(t);
  const bad = JSON.stringify({coat:'unknown',present:'true'});
  await page.evaluate(value => localStorage.setItem('lateNight.cat',value), bad);
  await page.reload();
  assert.equal(await page.locator('#window-cat').getAttribute('data-coat'), 'ginger');
  assert.equal(await page.locator('#window-cat').isVisible(), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('lateNight.cat')), bad);
});

test('cafe view remembers the street and preserves tape, rain and the journal', async t => {
  const page = await openRoom(t);
  await page.locator('[data-evening="records"]').click();
  await page.clock.runFor(1600);
  await page.locator('#journal-note').fill('The last café is still open.');
  const sounds = await page.evaluate(() => window.media.filter(a => !a.paused).map(a => a.src));
  await page.locator('button[data-view="cafe"]').click();
  assert.equal(await page.locator('body').getAttribute('data-view'), 'cafe');
  assert.deepEqual(await page.evaluate(() => window.media.filter(a => !a.paused).map(a => a.src)), sounds);
  assert.equal(await page.locator('#journal-note').inputValue(), 'The last café is still open.');
  await page.reload();
  assert.equal(await page.locator('body').getAttribute('data-view'), 'cafe');
  assert.equal(await page.locator('button[data-view="cafe"]').getAttribute('aria-pressed'), 'true');
});

test('cafe artwork and four view buttons fit a narrow phone and desktop', async t => {
  for (const width of [320, 768, 1440]) {
    const page = await openRoom(t, width);
    await page.locator('button[data-view="cafe"]').click();
    assert.ok(await page.locator('button[data-view="city"]').isVisible());
    assert.ok(await page.locator('button[data-view="cafe"]').isVisible());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    if (process.env.ATMOSPHERE_PREVIEW_DIR) await page.locator('#window-view').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR, `cafe-${width}.png`)});
    await page.close();
  }
});

test('cafe pavement follows the rain and respects hidden tabs and reduced motion', async t => {
  const page = await openRoom(t, 1280, 'no-preference');
  await page.locator('button[data-view="cafe"]').click();
  assert.equal(await page.locator('.cafe-pavement').evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.locator('#music-rain').click();
  assert.equal(await page.locator('.cafe-pavement').evaluate(el => getComputedStyle(el).animationName), 'cafe-reflections');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {configurable:true,value:true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await page.locator('.cafe-pavement').evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.cafe-pavement').evaluate(el => getComputedStyle(el).animationName), 'none');
});

test('cafe sign dims the shop, remembers closing time and leaves sound playing', async t => {
  const page = await openRoom(t, 320);
  await page.locator('[data-evening="records"]').click();
  await page.clock.runFor(1500);
  await page.locator('button[data-view="cafe"]').click();
  const sounds = await page.evaluate(() => window.media.filter(a => !a.paused).map(a => a.src));
  await page.locator('#cafe-sign').click();
  assert.equal(await page.locator('#window-view').getAttribute('data-cafe-open'), 'false');
  assert.equal(await page.locator('#cafe-sign').textContent(), 'GOOD NIGHT');
  assert.deepEqual(await page.evaluate(() => window.media.filter(a => !a.paused).map(a => a.src)), sounds);
  await page.reload();
  assert.equal(await page.locator('#cafe-sign').getAttribute('aria-pressed'), 'false');
  await page.locator('#cafe-sign').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#cafe-sign').getAttribute('aria-pressed'), 'true');
  await page.locator('button[data-view="city"]').click();
  assert.equal(await page.locator('#cafe-sign').isVisible(), false);
});

test('the last cafe starts real rain and a tape and a personal evening remembers its lights', async t => {
  const page = await openRoom(t);
  await page.locator('[data-evening="cafe"]').click();
  await page.clock.runFor(1600);
  assert.equal(await page.locator('body').getAttribute('data-view'), 'cafe');
  assert.equal(await page.locator('#window-cup').getAttribute('data-drink'), 'coffee');
  assert.equal(await page.locator('[data-evening="cafe"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => window.media.filter(a => !a.paused).length), 2);
  assert.match(await page.evaluate(() => ambienceTrack.src), /Light%20Gentle%20Rain/);
  await page.locator('#cafe-sign').click();
  assert.equal(await page.locator('[data-evening="cafe"]').getAttribute('aria-pressed'), 'false');
  await page.locator('#keep-evening').click();
  await page.reload();
  await page.locator('button[data-view="city"]').click();
  await page.locator('[data-evening="personal"]').click();
  assert.equal(await page.locator('body').getAttribute('data-view'), 'cafe');
  assert.equal(await page.locator('#cafe-sign').getAttribute('aria-pressed'), 'false');
  await page.locator('#cafe-sign').click();
  await page.locator('[data-evening="personal"]').click();
  assert.equal(await page.locator('#cafe-sign').getAttribute('aria-pressed'), 'false');
});

test('all cafe controls fit the room and quiet mode with six evening cards', async t => {
  for (const width of [320, 768, 1440]) {
    const page = await openRoom(t, width);
    await page.locator('[data-evening="cafe"]').click();
    await page.clock.runFor(1600);
    await page.locator('#keep-evening').click();
    for (const card of await page.locator('.scene-card').all()) {
      const box = await card.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width);
    }
    for (const view of ['city','mountains','coast','cafe']) {
      const box = await page.locator(`button[data-view="${view}"]`).boundingBox();
      const room = await page.locator('#window-view').boundingBox();
      assert.ok(box.x >= room.x && box.x + box.width <= room.x + room.width);
    }
    if (process.env.ATMOSPHERE_PREVIEW_DIR) await page.locator('#window-view').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR, `last-cafe-${width}.png`)});
    await page.locator('#quiet-room').click();
    await page.locator('#cafe-sign').click();
    assert.equal(await page.locator('#cafe-sign').getAttribute('aria-pressed'), 'false');
    await page.locator('#cafe-sign').click();
    assert.equal(await page.locator('#cafe-sign').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    await page.close();
  }
});

test('a quiet minute changes phases, pauses and finishes without adding focus statistics', async t => {
  const page = await openRoom(t);
  await page.locator('.mood[data-mood="calm"]').click();
  await page.locator('#breathing-ritual [data-breath-toggle]').click();
  assert.equal(await page.locator('#breathing-ritual [data-breath-phase]').textContent(), 'breathe in');
  await page.clock.runFor(4000);
  assert.equal(await page.locator('#breathing-ritual [data-breath-phase]').textContent(), 'breathe out');
  await page.locator('#breathing-ritual [data-breath-toggle]').click();
  await page.clock.runFor(10000);
  assert.equal(await page.locator('#breathing-ritual [data-breath-time]').textContent(), '00:56');
  const stats = await page.evaluate(() => readStats());
  await page.locator('#breathing-ritual [data-breath-toggle]').click();
  await page.clock.fastForward(56000);
  assert.equal(await page.locator('#breathing-ritual').getAttribute('data-state'), 'done');
  assert.equal(await page.locator('#breathing-ritual [data-breath-time]').textContent(), '00:00');
  assert.deepEqual(await page.evaluate(() => readStats()), stats);
});

test('a breath at the window preserves music, rain and the focus timer in quiet mode', async t => {
  const page = await openRoom(t, 390);
  await page.locator('[data-evening="records"]').click();
  await page.clock.runFor(1600);
  await page.evaluate(() => startFocus());
  const sounds = await page.evaluate(() => window.media.filter(a => !a.paused).map(a => a.src));
  await page.locator('#breath-arrive').click();
  await page.locator('#quiet-room').click();
  await page.clock.runFor(5000);
  assert.equal(await page.locator('#window-breathing [data-breath-phase]').textContent(), 'breathe out');
  assert.equal(await page.locator('#window-focus-time').textContent(), '24:55');
  assert.deepEqual(await page.evaluate(() => window.media.filter(a => !a.paused).map(a => a.src)), sounds);
  await page.locator('#window-breathing [data-breath-reset]').click();
  assert.equal(await page.locator('#window-breathing').isVisible(), false);
  assert.equal(await page.locator('#breath-arrive').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.room-desk').isVisible(), true);
});

test('quiet rhythm remembers duration and pace without resuming a session on refresh', async t => {
  const page = await openRoom(t);
  await page.locator('.mood[data-mood="calm"]').click();
  await page.locator('[data-breath-minutes="3"]').click();
  await page.locator('[data-breath-pace="even"]').click();
  await page.locator('#breath-arrive').click();
  assert.equal(await page.locator('#window-breathing [data-breath-time]').textContent(), '03:00');
  assert.equal(await page.locator('[data-breath-minutes="1"]').isDisabled(), true);
  await page.clock.runFor(8000);
  assert.equal(await page.locator('#window-breathing [data-breath-phase]').textContent(), 'breathe in');
  await page.reload();
  assert.equal(await page.locator('#window-breathing').isVisible(), false);
  assert.equal(await page.locator('[data-breath-minutes="3"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-breath-pace="even"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#breathing-ritual [data-breath-time]').textContent(), '03:00');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key,value) { if (key === 'lateNight.breathing') throw new Error('quota'); return original.call(this,key,value); };
  });
  await page.locator('[data-breath-minutes="5"]').click();
  assert.match(await page.locator('#breath-note').textContent(), /storage unavailable/);
  assert.equal(await page.locator('#breathing-ritual [data-breath-time]').textContent(), '05:00');
});

test('quiet rhythm pauses in a hidden tab and reduced motion leaves a still light', async t => {
  const page = await openRoom(t);
  await page.locator('#breath-arrive').click();
  const start = await page.locator('#window-breathing .breath-orb i').evaluate(el => getComputedStyle(el).transform);
  await page.clock.runFor(5000);
  const later = await page.locator('#window-breathing .breath-orb i').evaluate(el => getComputedStyle(el).transform);
  assert.equal(start, later);
  assert.equal(await page.locator('#window-breathing [data-breath-phase]').textContent(), 'breathe out');
  await page.evaluate(() => {
    Object.defineProperty(document,'hidden',{configurable:true,value:true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(120000);
  assert.equal(await page.locator('#breathing-ritual').getAttribute('data-state'), 'paused');
  assert.equal(await page.locator('#window-breathing [data-breath-time]').textContent(), '00:55');
  await page.evaluate(() => {
    Object.defineProperty(document,'hidden',{configurable:true,value:false});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await page.locator('#window-breathing [data-breath-toggle]').textContent(), 'continue');
  await page.locator('#window-breathing [data-breath-toggle]').click();
  await page.clock.fastForward(55000);
  assert.equal(await page.locator('#breathing-ritual').getAttribute('data-state'), 'done');
});

test('Sleep keeps the room awake during a quiet minute and dozes after it ends', async t => {
  const page = await openRoom(t);
  await page.locator('.mood[data-mood="sleep"]').click();
  await page.locator('#breath-arrive').click();
  await page.clock.runFor(26000);
  assert.equal(await page.locator('body').evaluate(el => el.classList.contains('is-dozing')), false);
  await page.clock.fastForward(34000);
  assert.equal(await page.locator('#breathing-ritual').getAttribute('data-state'), 'done');
  await page.clock.runFor(26000);
  assert.equal(await page.locator('body').evaluate(el => el.classList.contains('is-dozing')), true);
});

test('quiet rhythm fits small and wide windows and keeps controls reachable', async t => {
  for (const width of [320,768,1440]) {
    const page = await openRoom(t,width,'no-preference');
    await page.locator('#breath-arrive').click();
    await page.clock.runFor(3900);
    for (const quiet of [false,true]) {
      if (quiet) await page.locator('#quiet-room').click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),true);
      for (const button of await page.locator('#window-breathing button').all()) {
        const box = await button.boundingBox();
        const glass = await page.locator('#window-outside').boundingBox();
        assert.ok(box.height >= 44);
        assert.ok(box.x >= glass.x && box.x + box.width <= glass.x + glass.width);
        assert.ok(box.y + box.height <= glass.y + glass.height, `Breath controls fit ${width}`);
      }
      if (process.env.ATMOSPHERE_PREVIEW_DIR) await page.locator('#window-view').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR, `quiet-breath-${width}-${quiet ? 'quiet' : 'room'}.png`)});
    }
    await page.locator('#window-breathing [data-breath-toggle]').click();
    await page.locator('#window-breathing [data-breath-reset]').click();
    assert.equal(await page.locator('#window-breathing').isVisible(),false);
    await page.close();
  }
});

test('invalid quiet rhythm preferences fall back without overwriting their saved value', async t => {
  const page = await openRoom(t);
  const invalid = JSON.stringify({minutes:999,pace:'__proto__'});
  await page.evaluate(value => localStorage.setItem('lateNight.breathing',value),invalid);
  await page.reload();
  await page.locator('.mood[data-mood="calm"]').click();
  assert.equal(await page.locator('[data-breath-minutes="1"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-breath-pace="gentle"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(() => localStorage.getItem('lateNight.breathing')),invalid);
});

test('the sound timer starts no audio and cancelling leaves the evening playing', async t => {
  const page = await openRoom(t);
  await page.locator('#sound-timer-start').click();
  assert.equal(await page.evaluate(() => window.media.some(a => !a.paused)),false);
  await page.locator('#sound-timer-cancel').click();
  await page.locator('[data-evening="records"]').click();
  await page.clock.runFor(1600);
  const sounds = await page.evaluate(() => window.media.filter(a => !a.paused).map(a => a.src));
  await page.locator('#sound-timer-start').click();
  await page.clock.runFor(5000);
  assert.equal(await page.locator('#sound-timer-time').textContent(),'29:55');
  await page.locator('#sound-timer-cancel').click();
  assert.deepEqual(await page.evaluate(() => window.media.filter(a => !a.paused).map(a => a.src)),sounds);
});

test('the sound timer stops tape, rain and radio without resetting the focus session', async t => {
  const page = await openRoom(t);
  await page.locator('[data-evening="records"]').click();
  await page.clock.runFor(1600);
  await page.locator('[data-sound-minutes="15"]').click();
  await page.locator('#sound-timer-start').click();
  await page.evaluate(() => { startFocus(); soundTimerEndsAt = Date.now() + 2000; });
  await page.clock.runFor(2500);
  assert.equal(await page.evaluate(() => window.media.some(a => !a.paused)),false);
  assert.equal(await page.locator('#sound-timer').getAttribute('data-state'),'done');
  assert.equal(await page.evaluate(() => Boolean(focusEndsAt)),true);
  await page.locator('[data-station="radio"]').click();
  assert.equal(await page.locator('#radio-frame iframe').count(),1);
  await page.locator('#sound-timer-start').click();
  await page.evaluate(() => { soundTimerEndsAt = Date.now() + 1000; });
  await page.clock.runFor(1500);
  assert.equal(await page.locator('#radio-frame iframe').count(),0);
});

test('the final minute fades both layers without changing saved volume and cancel restores them', async t => {
  const page = await openRoom(t);
  await page.locator('[data-evening="records"]').click();
  await page.clock.runFor(3000);
  await page.locator('#player-volume').fill('60');
  await page.locator('#room-volume').fill('80');
  await page.locator('#sound-timer-start').click();
  await page.evaluate(() => { soundTimerEndsAt = Date.now() + 30000; paintSoundTimer(); });
  assert.equal(await page.evaluate(() => tapeAudio.volume),.3);
  assert.ok(Math.abs(await page.evaluate(() => ambienceTrack.volume) - .55 * .8 * .5) < .001);
  assert.equal(await page.locator('#player-volume').inputValue(),'60');
  assert.equal(await page.locator('#room-volume').inputValue(),'80');
  assert.equal(await page.evaluate(() => localStorage.getItem('lateNight.volume')),'0.6');
  await page.locator('#player-volume').fill('40');
  assert.equal(await page.evaluate(() => tapeAudio.volume),.2);
  await page.locator('[data-rain="drizzle"]').click();
  await page.clock.runFor(1600);
  assert.ok(await page.evaluate(() => ambienceTrack.volume) < .4 * .8 * .5);
  await page.locator('#sound-timer-cancel').click();
  assert.equal(await page.evaluate(() => tapeAudio.volume),.4);
  assert.ok(Math.abs(await page.evaluate(() => ambienceTrack.volume) - .4 * .8) < .001);
});

test('sound countdown stays on the glass in quiet mode and lamp shutdown is optional', async t => {
  const page = await openRoom(t,320);
  await page.locator('#sound-timer-lamp').check();
  await page.locator('#sound-timer-start').click();
  await page.locator('#quiet-room').click();
  assert.equal(await page.locator('#window-sound-timer').isVisible(),true);
  await page.locator('#window-sound-timer').click();
  assert.equal(await page.locator('#desk-lamp').getAttribute('aria-pressed'),'true');
  await page.keyboard.press('Escape');
  await page.locator('#sound-timer-start').click();
  await page.evaluate(() => { soundTimerEndsAt = Date.now() + 1000; });
  await page.clock.runFor(1500);
  assert.equal(await page.locator('#desk-lamp').getAttribute('aria-pressed'),'false');
  assert.equal(await page.evaluate(() => localStorage.getItem('lateNight.deskLamp')),'0');
  assert.equal(await page.locator('#window-sound-time').textContent(),'finished');
  await page.locator('#window-sound-timer').click();
  assert.equal(await page.locator('#window-sound-timer').isVisible(),false);
});

test('sound timers restore their original deadline and catch overdue endings before playback', async t => {
  const page = await openRoom(t);
  await page.locator('#sound-timer-lamp').check();
  await page.locator('#sound-timer-start').click();
  const deadline = await page.evaluate(() => soundTimerEndsAt);
  await page.clock.runFor(10000);
  await page.reload();
  assert.equal(await page.evaluate(() => soundTimerEndsAt),deadline);
  assert.equal(await page.locator('#sound-timer-time').textContent(),'29:50');
  assert.equal(await page.evaluate(() => window.media.some(a => !a.paused)),false);
  await page.evaluate(() => {
    const timer = JSON.parse(localStorage.getItem('lateNight.soundTimer'));
    timer.endsAt = Date.now() - 1000;
    localStorage.setItem('lateNight.soundTimer',JSON.stringify(timer));
    localStorage.setItem('lateNight.listen','1');
    localStorage.setItem('lateNight.musicRain','1');
  });
  await page.reload();
  assert.equal(await page.locator('#sound-timer').getAttribute('data-state'),'done');
  assert.equal(await page.locator('#desk-lamp').getAttribute('aria-pressed'),'false');
  assert.equal(await page.evaluate(() => window.media.some(a => !a.paused)),false);
  assert.equal(await page.evaluate(() => localStorage.getItem('lateNight.listen')),'0');
  await page.reload();
  assert.equal(await page.locator('#sound-timer').getAttribute('data-state'),'done');
});

test('invalid stored sound timers are ignored and write failures keep a working local timer', async t => {
  const page = await openRoom(t);
  const invalid = JSON.stringify({minutes:999,lamp:true,endsAt:-1,finished:false});
  await page.evaluate(value => localStorage.setItem('lateNight.soundTimer',value),invalid);
  await page.reload();
  assert.equal(await page.locator('#sound-timer-time').textContent(),'30:00');
  assert.equal(await page.evaluate(() => localStorage.getItem('lateNight.soundTimer')),invalid);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key,value) { if (key === 'lateNight.soundTimer') throw new Error('quota'); return original.call(this,key,value); };
  });
  await page.locator('#sound-timer-start').click();
  assert.match(await page.locator('#sound-timer-note').textContent(),/storage unavailable/);
  await page.evaluate(() => { soundTimerEndsAt = Date.now() + 1000; });
  await page.clock.runFor(1500);
  assert.equal(await page.locator('#sound-timer').getAttribute('data-state'),'done');
});

test('expired sound timers reject late playback failures and allow a fresh manual play', async t => {
  const page = await openRoom(t);
  await page.evaluate(() => { window.deferAudio = true; });
  await page.locator('#evening-toggle').click();
  await page.locator('#sound-timer-start').click();
  await page.evaluate(() => { soundTimerEndsAt = Date.now() + 1000; });
  await page.clock.runFor(1500);
  await page.evaluate(() => {
    window.deferAudio = false;
    window.media.forEach(track => track.rejectPlay?.(new Error('late failure')));
  });
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => tapeRunning || listening),false);
  assert.equal(await page.evaluate(() => window.media.some(a => !a.paused)),false);
  await page.locator('#player-play').click();
  await page.clock.runFor(3000);
  assert.equal(await page.evaluate(() => tapeRunning),true);
  assert.equal(await page.evaluate(() => tapeAudio.volume),.55);
});

test('sound timer cards and the window countdown fit phones, tablets and quiet mode', async t => {
  for (const width of [320,768,1440]) {
    const page = await openRoom(t,width);
    await page.locator('[data-evening="records"]').click();
    await page.clock.runFor(1600);
    await page.locator('#sound-timer-start').click();
    assert.equal(await page.locator('#sound-timer-cancel').evaluate(el => el === document.activeElement),true);
    for (const quiet of [false,true]) {
      if (quiet) await page.locator('#quiet-room').click();
      const badge = await page.locator('#window-sound-timer').boundingBox();
      const play = await page.locator('#evening-toggle').boundingBox();
      assert.ok(badge.x + badge.width <= play.x,`Countdown leaves room for playback at ${width}`);
      assert.ok(badge.height >= 44);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),true);
      if (process.env.ATMOSPHERE_PREVIEW_DIR) await page.locator('#window-view').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR,`sound-timer-${width}-${quiet ? 'quiet' : 'room'}.png`)});
    }
    await page.locator('#window-sound-timer').click();
    assert.equal(await page.locator('#window-sound-timer').isVisible(),false);
    await page.close();
  }
});

test('unavailable tapes offer an honest retry while real rain keeps playing', async t => {
  const page = await openRoom(t);
  await page.locator('#music-rain').click();
  await page.clock.runFor(1600);
  await page.evaluate(() => { window.failAudio = true; });
  await page.locator('#player-play').click();
  await page.waitForFunction(() => document.getElementById('player-play').textContent === 'retry');
  assert.match(await page.locator('#tape-status').textContent(),/Recording unavailable/);
  assert.equal(await page.evaluate(() => typeof buildSynth),'undefined');
  assert.equal(await page.evaluate(() => Boolean(ambienceTrack && !ambienceTrack.paused)),true);
  await page.evaluate(() => { window.failAudio = false; });
  await page.locator('#player-play').click();
  assert.equal(await page.locator('#player-play').textContent(),'pause');
});

test('illustrated cassette cards cue paused recordings and preserve playing rain', async t => {
  const page = await openRoom(t);
  await page.locator('#browse-tapes').click();
  assert.ok(await page.locator('.cassette-card').count() > 2);
  const second = await page.locator('.cassette-card').nth(1).getAttribute('data-tape-src');
  await page.locator('.cassette-card').nth(1).click();
  assert.equal(await page.locator('#tape-choice').inputValue(),second);
  assert.equal(await page.evaluate(() => window.media.some(a => !a.paused)),false);
  await page.locator('#evening-toggle').click();
  await page.clock.runFor(3000);
  const rain = await page.evaluate(() => ambienceTrack.src);
  await page.locator('.cassette-card').nth(2).click();
  assert.equal(await page.evaluate(() => tapeRunning),true);
  assert.equal(await page.evaluate(() => ambienceTrack.src),rain);
  assert.equal(await page.locator('.cassette-card[aria-pressed="true"]').evaluate(el => el === document.activeElement),true);
  await page.locator('#close-collection').click();
  assert.equal(await page.locator('#tape-collection').isVisible(),false);
  assert.equal(await page.locator('#browse-tapes').evaluate(el => el === document.activeElement),true);
});

test('the cassette shelf searches, saves without playing and pages through real recordings', async t => {
  const page = await openRoom(t);
  await page.locator('#browse-tapes').click();
  const title = await page.locator('.cassette-card strong').nth(1).textContent();
  const selected = await page.locator('#tape-choice').inputValue();
  await page.locator('#collection-search').fill(title.toUpperCase());
  assert.equal(await page.locator('.cassette-card').count(),1);
  await page.locator('.cassette-save').click();
  assert.equal(await page.locator('#tape-choice').inputValue(),selected);
  assert.equal(await page.evaluate(() => window.media.some(a => !a.paused)),false);
  await page.locator('#collection-filter').click();
  assert.equal(await page.locator('.cassette-card').count(),1);
  assert.equal(await page.locator('.cassette-save').getAttribute('aria-pressed'),'true');
  await page.locator('#collection-search').fill('no such recording at midnight');
  assert.equal(await page.locator('.cassette-card').count(),0);
  assert.match(await page.locator('#collection-results').textContent(),/No recordings match/);
  await page.locator('#collection-search').fill('');
  await page.locator('#collection-filter').click();
  assert.equal(await page.locator('.cassette-card').count(),12);
  await page.locator('#collection-more').click();
  assert.ok(await page.locator('.cassette-card').count() > 12);
  assert.equal(await page.locator('.cassette-card').nth(12).evaluate(el => el === document.activeElement),true);
  await page.reload();
  await page.locator('#browse-tapes').click();
  assert.equal(await page.locator('#collection-filter').textContent(),'saved · 1');
});

test('recording position supports paused seeking and ignores metadata from an old tape', async t => {
  const page = await openRoom(t);
  assert.equal(await page.locator('#tape-seek').isDisabled(),true);
  await page.locator('#player-play').click();
  await page.evaluate(() => {
    window.previousTape = tapeAudio;
    tapeAudio.duration = 600;
    tapeAudio.currentTime = 120;
    tapeAudio.dispatchEvent(new Event('loadedmetadata'));
  });
  assert.equal(await page.locator('#tape-elapsed').textContent(),'02:00');
  assert.equal(await page.locator('#tape-duration').textContent(),'10:00');
  await page.locator('#player-play').click();
  await page.clock.runFor(1400);
  await page.locator('#tape-seek').fill('500');
  assert.equal(await page.evaluate(() => tapeAudio.currentTime),300);
  assert.equal(await page.evaluate(() => tapeAudio.paused),true);
  assert.match(await page.locator('#tape-source').getAttribute('href'),/^https:\/\/archive.org\/details\//);
  const next = await page.locator('#tape-choice option').nth(1).getAttribute('value');
  await page.locator('#tape-choice').selectOption(next);
  await page.evaluate(() => { previousTape.currentTime = 400; previousTape.dispatchEvent(new Event('timeupdate')); });
  assert.equal(await page.locator('#tape-elapsed').textContent(),'00:00');
  assert.equal(await page.locator('#tape-seek').isDisabled(),true);
});

test('cassette shelf and playback controls fit phones and desktop with keyboard favourites', async t => {
  for (const width of [320,768,1440]) {
    const page = await openRoom(t,width);
    await page.locator('#browse-tapes').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),true);
    for (const card of await page.locator('.cassette-card').all()) {
      const box = await card.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width);
    }
    await page.locator('.cassette-save').first().focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('.cassette-save').first().getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('.cassette-save').first().evaluate(el => el === document.activeElement),true);
    assert.equal(await page.evaluate(() => window.media.some(a => !a.paused)),false);
    if (process.env.ATMOSPHERE_PREVIEW_DIR) await page.locator('#tape-collection').screenshot({path:path.join(process.env.ATMOSPHERE_PREVIEW_DIR,`cassette-shelf-${width}.png`)});
    await page.locator('#close-collection').click();
    await page.locator('[data-station="radio"]').click();
    assert.equal(await page.locator('#tape-status').isVisible(),false);
    await page.evaluate(() => { stopEveningSound(); });
    assert.match(await page.locator('#player-title').textContent(),/lofi girl/);
    await page.close();
  }
});
