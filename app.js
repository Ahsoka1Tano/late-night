/* Late Night — a tiny digital room for quiet evenings. */

const clockEl = document.getElementById("clock");

function tick() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  clockEl.textContent = `${hh}:${mm}`;
}

tick();
setInterval(tick, 10000);

/* --- moods --- */
const MOODS = {
  calm:  "Nothing needs solving tonight.",
  music: "Let the room hum for a while.",
  focus: "One small thing is enough.",
  rain:  "The window is doing all the talking.",
  space: "Everything is quiet out there too.",
  sleep: "Slow down. The day is over.",
};

const moodLine = document.getElementById("mood-line");
const moodButtons = document.querySelectorAll(".mood");

function setMood(mood, { save = true } = {}) {
  if (!MOODS[mood]) mood = "calm";
  document.body.dataset.mood = mood;

  moodButtons.forEach((btn) => {
    const picked = btn.dataset.mood === mood;
    btn.classList.toggle("is-active", picked);

    // a short flare, so a keyboard pick is as visible as a click
    if (picked && save) {
      btn.classList.remove("just-picked");
      void btn.offsetWidth;
      btn.classList.add("just-picked");
    }
  });

  moodLine.classList.add("is-fading");
  setTimeout(() => {
    moodLine.textContent = MOODS[mood];
    moodLine.classList.remove("is-fading");
  }, 300);

  if (mood === "rain") {
    startRain();
    startRainSound();
  } else {
    stopRain();
    stopRainSound();
  }

  if (mood === "space") startStars();
  else stopStars();

  // nothing plays on in a room you have left
  if (mood !== "music") {
    if (tapeRunning) setTape(false);
    closeRadio();
  } else if (station === "radio") {
    openRadio();
  }

  if (mood === "sleep") {
    scheduleDoze();
  } else {
    clearDoze();
    document.body.classList.remove("is-dozing", "is-deeper");
  }

  // a finished session is history once you leave the room
  if (mood !== "focus" && focusBlock.classList.contains("is-done")) resetFocus();

  if (save) localStorage.setItem("lateNight.mood", mood);
}

moodButtons.forEach((btn) => {
  btn.addEventListener("click", () => setMood(btn.dataset.mood));
});

/* --- rain --- */
const rainCanvas = document.getElementById("rain");
const rainCtx = rainCanvas.getContext("2d");
const calmEnough = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// how hard it comes down: spacing between streaks, how fast, how many run down the glass
const RAIN_LEVELS = {
  drizzle:  { spacing: 20, speed: 0.72, alpha: 0.8, glass: 58 },
  steady:   { spacing: 9,  speed: 1,    alpha: 1,   glass: 34 },
  downpour: { spacing: 5,  speed: 1.32, alpha: 1.1, glass: 21 },
};

const savedRain = localStorage.getItem("lateNight.rain");
let rainLevel = RAIN_LEVELS[savedRain] ? savedRain : "steady";
let drops = [];
let glassDrops = [];
let rainFrame = null;

function sizeRain() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  rainCanvas.width = window.innerWidth * dpr;
  rainCanvas.height = window.innerHeight * dpr;
  rainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function seedDrops() {
  const level = RAIN_LEVELS[rainLevel];

  const count = Math.round(window.innerWidth / level.spacing);
  drops = Array.from({ length: count }, () => spawnDrop(true));

  const clinging = Math.round(window.innerWidth / level.glass);
  glassDrops = Array.from({ length: clinging }, () => spawnGlassDrop(true));
}

function spawnDrop(scattered = false) {
  // depth: 0 = far and faint, 1 = close and quick
  const depth = Math.random();
  const level = RAIN_LEVELS[rainLevel];
  return {
    x: Math.random() * window.innerWidth,
    y: scattered ? Math.random() * window.innerHeight : -40,
    length: (8 + depth * 22) * (0.75 + level.speed * 0.3),
    speed: (3 + depth * 9) * level.speed,
    width: 0.5 + depth * 0.9,
    alpha: (0.08 + depth * 0.22) * level.alpha,
  };
}

/* a fat drop that clings to the window, rests, then slides down leaving a trail */
function spawnGlassDrop(scattered = false) {
  return {
    x: Math.random() * window.innerWidth,
    y: scattered ? Math.random() * window.innerHeight : -20,
    r: 1.8 + Math.random() * 3.4,
    speed: 0,
    hold: Math.round(Math.random() * 280),
    trail: [],
  };
}

function drawGlassDrop(d) {
  // the trail it left on the glass, slowly drying
  for (let i = d.trail.length - 1; i >= 0; i--) {
    const t = d.trail[i];
    t.alpha -= 0.009;
    if (t.alpha <= 0) {
      d.trail.splice(i, 1);
      continue;
    }
    rainCtx.fillStyle = `rgba(200, 224, 255, ${t.alpha})`;
    rainCtx.beginPath();
    rainCtx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    rainCtx.fill();
  }

  const glow = rainCtx.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.3, 0, d.x, d.y, d.r);
  glow.addColorStop(0, "rgba(226, 240, 255, 0.5)");
  glow.addColorStop(0.55, "rgba(170, 205, 240, 0.22)");
  glow.addColorStop(1, "rgba(140, 180, 220, 0.04)");
  rainCtx.fillStyle = glow;
  rainCtx.beginPath();
  rainCtx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
  rainCtx.fill();

  if (d.hold > 0) {
    d.hold--;
    return;
  }

  d.speed += 0.05 + d.r * 0.012;
  const before = d.y;
  d.y += d.speed;

  // leave a thin, uneven line of water behind
  for (let y = before; y < d.y; y += 3) {
    d.trail.push({
      x: d.x + (Math.random() - 0.5) * 0.8,
      y,
      r: d.r * (0.18 + Math.random() * 0.14),
      alpha: 0.13,
    });
  }

  // the drop spends itself on the way down
  if (d.r > 1.2) d.r -= 0.004;

  // heavier drops run further; small ones stall again
  if (d.speed > 0.6 && Math.random() < 0.012) {
    d.speed = 0;
    d.hold = 30 + Math.random() * 160;
  }

  if (d.y - d.r > window.innerHeight) Object.assign(d, spawnGlassDrop());
}

function drawRain() {
  rainCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  rainCtx.lineCap = "round";

  for (let i = 0; i < drops.length; i++) {
    const d = drops[i];
    rainCtx.strokeStyle = `rgba(190, 220, 255, ${d.alpha})`;
    rainCtx.lineWidth = d.width;
    rainCtx.beginPath();
    rainCtx.moveTo(d.x, d.y);
    rainCtx.lineTo(d.x - d.length * 0.12, d.y + d.length);
    rainCtx.stroke();

    d.y += d.speed;
    d.x -= d.speed * 0.12;

    if (d.y > window.innerHeight) drops[i] = spawnDrop();
  }

  for (const d of glassDrops) drawGlassDrop(d);

  rainFrame = requestAnimationFrame(drawRain);
}

function startRain() {
  if (!calmEnough || rainFrame !== null) return;
  sizeRain();
  if (!drops.length || !glassDrops.length) seedDrops();
  rainCanvas.classList.add("is-on");
  rainFrame = requestAnimationFrame(drawRain);
}

function stopRain() {
  rainCanvas.classList.remove("is-on");
  if (rainFrame === null) return;
  cancelAnimationFrame(rainFrame);
  rainFrame = null;
  // let the fade finish before wiping the canvas
  setTimeout(() => {
    if (rainFrame === null) rainCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }, 1600);
}

const rainSteps = document.querySelectorAll(".rain-step");

function setRainLevel(level, { save = true } = {}) {
  if (!RAIN_LEVELS[level]) level = "steady";
  rainLevel = level;
  document.body.dataset.rain = level;

  rainSteps.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.rain === level);
  });

  if (drops.length) seedDrops();
  tuneRainSound();
  if (save) localStorage.setItem("lateNight.rain", level);
}

rainSteps.forEach((btn) => {
  btn.addEventListener("click", () => setRainLevel(btn.dataset.rain));
});

window.addEventListener("resize", () => {
  if (rainFrame !== null) {
    sizeRain();
    seedDrops();
  }
  if (starsFrame !== null) {
    sizeStars();
    seedStars();
  }
});



// no reason to keep the weather running in an empty room
document.addEventListener("visibilitychange", () => {
  const mood = document.body.dataset.mood;

  if (document.hidden) {
    if (rainFrame !== null) {
      cancelAnimationFrame(rainFrame);
      rainFrame = null;
    }
    if (starsFrame !== null) {
      cancelAnimationFrame(starsFrame);
      starsFrame = null;
    }
    return;
  }

  if (mood === "rain") startRain();
  if (mood === "space") startStars();
});


/* --- one slow drift, shared by the city lights and the sky --- */
const city = document.querySelector(".city");

let driftAimX = 0;
let driftAimY = 0;
let driftX = 0;
let driftY = 0;
let driftFrame = null;

function easeDrift() {
  driftX += (driftAimX - driftX) * 0.045;
  driftY += (driftAimY - driftY) * 0.045;
  city.style.transform = `translate3d(${driftX.toFixed(2)}px, ${driftY.toFixed(2)}px, 0)`;

  if (Math.abs(driftAimX - driftX) < 0.05 && Math.abs(driftAimY - driftY) < 0.05) {
    driftFrame = null;
    return;
  }
  driftFrame = requestAnimationFrame(easeDrift);
}

window.addEventListener("pointermove", (e) => {
  if (!calmEnough) return;
  driftAimX = (e.clientX / window.innerWidth - 0.5) * -16;
  driftAimY = (e.clientY / window.innerHeight - 0.5) * -9;
  if (driftFrame === null) driftFrame = requestAnimationFrame(easeDrift);
});


/* --- keys --- */
const RAIN_ORDER = ["drizzle", "steady", "downpour"];
const hint = document.getElementById("hint");

function retireHint() {
  hint.classList.add("is-gone");
  localStorage.setItem("lateNight.knowsKeys", "1");
}

if (localStorage.getItem("lateNight.knowsKeys")) hint.classList.add("is-gone");

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "");
  if (typing) return;

  const number = Number(e.key);
  if (number >= 1 && number <= moodButtons.length) {
    setMood(moodButtons[number - 1].dataset.mood);
    retireHint();
    return;
  }

  if (document.body.dataset.mood === "focus" && (e.key === " " || e.code === "Space")) {
    e.preventDefault();
    if (focusEndsAt) pauseFocus();
    else startFocus();
    retireHint();
    return;
  }

  if (document.body.dataset.mood === "music" && station === "tape") {
    const nudge = e.key === "ArrowUp" ? 0.05 : e.key === "ArrowDown" ? -0.05 : 0;
    if (nudge) {
      e.preventDefault();
      setVolume(tapeVolume + nudge);
      retireHint();
      return;
    }
  }

  if (document.body.dataset.mood !== "rain") return;

  const step = e.key === "[" ? -1 : e.key === "]" ? 1 : 0;
  if (!step) return;

  const next = RAIN_ORDER.indexOf(rainLevel) + step;
  if (next < 0 || next >= RAIN_ORDER.length) return;

  setRainLevel(RAIN_ORDER[next]);
  retireHint();
});


/* --- focus --- */
const FOCUS_PRESETS = [15, 25, 45, 60];

const savedMinutes = Number(localStorage.getItem("lateNight.focusMinutes"));
let focusMinutes = FOCUS_PRESETS.includes(savedMinutes) ? savedMinutes : 25;

function focusLength() {
  return focusMinutes * 60 * 1000;
}

const focusBlock = document.getElementById("focus");
const focusTime = document.getElementById("focus-time");
const focusToggle = document.getElementById("focus-toggle");
const focusReset = document.getElementById("focus-reset");
const focusNote = document.getElementById("focus-note");

let focusLeft = focusLength();
let focusEndsAt = null;
let focusTick = null;

const BASE_TITLE = document.title;

function paintFocus() {
  const left = Math.max(0, focusEndsAt ? focusEndsAt - Date.now() : focusLeft);
  const total = Math.ceil(left / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  focusTime.textContent = `${mm}:${ss}`;

  // so the session is still visible from another window
  document.title = focusEndsAt ? `${mm}:${ss} — ${BASE_TITLE}` : BASE_TITLE;

  if (focusEndsAt && left <= 0) finishFocus();
}

function startFocus() {
  focusEndsAt = Date.now() + focusLeft;
  focusToggle.textContent = "pause";
  focusBlock.classList.add("is-running");
  focusBlock.classList.remove("is-done");
  focusNote.textContent = "";
  focusTick = setInterval(paintFocus, 250);
  paintFocus();
}

function pauseFocus() {
  focusLeft = Math.max(0, focusEndsAt - Date.now());
  focusEndsAt = null;
  clearInterval(focusTick);
  focusTick = null;
  focusToggle.textContent = "start";
  focusBlock.classList.remove("is-running");
  paintFocus();
}

function resetFocus() {
  clearInterval(focusTick);
  focusTick = null;
  focusEndsAt = null;
  focusLeft = focusLength();
  focusToggle.textContent = "start";
  focusBlock.classList.remove("is-running", "is-done");
  focusNote.textContent = "";
  paintFocus();
}

function finishFocus() {
  clearInterval(focusTick);
  focusTick = null;
  focusEndsAt = null;
  focusLeft = focusLength();
  focusToggle.textContent = "start";
  focusBlock.classList.remove("is-running");
  focusBlock.classList.add("is-done");
  focusTime.textContent = "00:00";
  document.title = BASE_TITLE;
  focusNote.textContent = `that was ${focusMinutes} quiet minutes`;
  keepSession(focusMinutes);
}

const focusPresets = document.querySelectorAll(".focus-preset");

function setFocusLength(minutes, { save = true } = {}) {
  if (!FOCUS_PRESETS.includes(minutes)) minutes = 25;
  focusMinutes = minutes;

  focusPresets.forEach((btn) => {
    btn.classList.toggle("is-active", Number(btn.dataset.minutes) === minutes);
  });

  resetFocus();
  if (save) localStorage.setItem("lateNight.focusMinutes", String(minutes));
}

focusPresets.forEach((btn) => {
  btn.addEventListener("click", () => setFocusLength(Number(btn.dataset.minutes)));
});

focusToggle.addEventListener("click", () => {
  if (focusEndsAt) pauseFocus();
  else startFocus();
});

focusReset.addEventListener("click", resetFocus);

setFocusLength(focusMinutes, { save: false });


/* --- one line for tonight --- */
const TONIGHT_LINES = [
  "You don't need to rush tonight.",
  "One small thing is enough.",
  "The day is allowed to end unfinished.",
  "Nothing is expected of you for the next hour.",
  "Somewhere it is raining on an empty street.",
  "Let the noise settle.",
  "The city is asleep, mostly.",
  "Leave tomorrow where it is.",
  "Warm light, quiet room, nothing urgent.",
  "You can close this and nothing breaks.",
  "Slow is a fine speed.",
  "Half the lights are off already.",
  "Every window has someone behind it, winding down.",
  "The rest of it can wait until it is light again.",
];

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

// the same line all evening, a different one tomorrow
function lineForDay(key) {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) % 100000;
  return TONIGHT_LINES[hash % TONIGHT_LINES.length];
}

document.getElementById("tonight").textContent = lineForDay(today());


/* --- tiny journal --- */
const journalChips = document.querySelectorAll(".chip");
const journalNote = document.getElementById("journal-note");
const journalKept = document.getElementById("journal-kept");
let keptTimer = null;

function flashKept() {
  journalKept.classList.add("is-shown");
  clearTimeout(keptTimer);
  keptTimer = setTimeout(() => journalKept.classList.remove("is-shown"), 1800);
}

function readJournal() {
  try {
    return JSON.parse(localStorage.getItem("lateNight.journal")) || {};
  } catch {
    return {};
  }
}

function writeJournal(entry) {
  const all = readJournal();
  all[today()] = { ...all[today()], ...entry };
  localStorage.setItem("lateNight.journal", JSON.stringify(all));
}

function paintJournal() {
  const entry = readJournal()[today()] || {};

  journalChips.forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.day === entry.day);
  });

  if (entry.note) journalNote.value = entry.note;
}

journalChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    const entry = readJournal()[today()] || {};
    // clicking the same one again takes it back
    const day = entry.day === chip.dataset.day ? null : chip.dataset.day;
    writeJournal({ day });
    paintJournal();
    if (day) flashKept();
  });
});

let noteTimer = null;
journalNote.addEventListener("input", () => {
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => {
    writeJournal({ note: journalNote.value.trim() });
    flashKept();
  }, 600);
});

paintJournal();


/* --- traces of the nights before --- */
const traces = document.getElementById("traces");

function readStats() {
  try {
    return JSON.parse(localStorage.getItem("lateNight.stats")) || {};
  } catch {
    return {};
  }
}

function writeStats(stats) {
  localStorage.setItem("lateNight.stats", JSON.stringify(stats));
}

function yesterday() {
  const then = new Date(Date.now() - 86400000);
  return `${then.getFullYear()}-${then.getMonth() + 1}-${then.getDate()}`;
}

function countTonight() {
  const stats = readStats();
  if (stats.lastNight === today()) return stats;

  stats.nights = (stats.nights || 0) + 1;
  stats.streak = stats.lastNight === yesterday() ? (stats.streak || 0) + 1 : 1;
  stats.lastNight = today();

  writeStats(stats);
  return stats;
}

// only finished sessions count — pausing and walking away does not
function keepSession(minutes) {
  const stats = readStats();
  stats.sessions = (stats.sessions || 0) + 1;
  stats.minutes = (stats.minutes || 0) + minutes;
  writeStats(stats);
  paintTraces();
}

function paintTraces() {
  const stats = readStats();
  const parts = [];

  parts.push(`${stats.nights || 1} ${stats.nights === 1 ? "night" : "nights"} here`);
  if (stats.streak > 1) parts.push(`${stats.streak} in a row`);
  if (stats.sessions) {
    parts.push(`${stats.sessions} ${stats.sessions === 1 ? "session" : "sessions"}`);
    parts.push(`${stats.minutes} minutes focused`);
  }

  traces.textContent = parts.join(" · ");
}

countTonight();
paintTraces();


/* --- stars --- */
const starsCanvas = document.getElementById("stars");
const starsCtx = starsCanvas.getContext("2d");

let stars = [];
let starsFrame = null;
let starsClock = 0;

function sizeStars() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  starsCanvas.width = window.innerWidth * dpr;
  starsCanvas.height = window.innerHeight * dpr;
  starsCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function seedStars() {
  const count = Math.round(window.innerWidth / 5);
  stars = Array.from({ length: count }, () => {
    // depth: 0 = far and still, 1 = near and drifting
    const depth = Math.random();
    return {
      depth,
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: 0.4 + depth * 1.1,
      drift: 0.015 + depth * 0.075,
      base: 0.25 + depth * 0.5,
      phase: Math.random() * Math.PI * 2,
      blink: 0.0008 + Math.random() * 0.0022,
      warm: Math.random() < 0.22,
    };
  });
}

// once in a long while, something crosses the sky
let comet = null;

function maybeComet() {
  if (comet || Math.random() > 0.0009) return;

  comet = {
    x: Math.random() * window.innerWidth * 0.7,
    y: Math.random() * window.innerHeight * 0.45,
    vx: 4.5 + Math.random() * 3,
    vy: 1.4 + Math.random() * 1.2,
    life: 1,
  };
}

function drawComet() {
  if (!comet) return;

  const tailX = comet.x - comet.vx * 14;
  const tailY = comet.y - comet.vy * 14;
  const trail = starsCtx.createLinearGradient(comet.x, comet.y, tailX, tailY);
  trail.addColorStop(0, `rgba(226, 236, 255, ${0.75 * comet.life})`);
  trail.addColorStop(1, "rgba(226, 236, 255, 0)");

  starsCtx.strokeStyle = trail;
  starsCtx.lineWidth = 1.4;
  starsCtx.lineCap = "round";
  starsCtx.beginPath();
  starsCtx.moveTo(comet.x, comet.y);
  starsCtx.lineTo(tailX, tailY);
  starsCtx.stroke();

  comet.x += comet.vx;
  comet.y += comet.vy;
  comet.life -= 0.009;

  if (comet.life <= 0 || comet.x > window.innerWidth + 60) comet = null;
}

function drawStars() {
  starsClock += 16;
  starsCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  for (const s of stars) {
    const flicker = 0.68 + 0.32 * Math.sin(starsClock * s.blink + s.phase);
    const alpha = s.base * flicker;

    // the near stars swing further than the far ones
    const shiftX = driftX * (0.25 + s.depth * 1.5);
    const shiftY = driftY * (0.25 + s.depth * 1.5);

    starsCtx.fillStyle = s.warm
      ? `rgba(255, 224, 190, ${alpha})`
      : `rgba(206, 220, 255, ${alpha})`;
    starsCtx.beginPath();
    starsCtx.arc(s.x + shiftX, s.y + shiftY, s.r, 0, Math.PI * 2);
    starsCtx.fill();

    s.x -= s.drift;
    if (s.x < -2) {
      s.x = window.innerWidth + 2;
      s.y = Math.random() * window.innerHeight;
    }
  }

  maybeComet();
  drawComet();

  starsFrame = requestAnimationFrame(drawStars);
}

function startStars() {
  if (!calmEnough || starsFrame !== null) return;
  sizeStars();
  if (!stars.length) seedStars();
  starsCanvas.classList.add("is-on");
  starsFrame = requestAnimationFrame(drawStars);
}

function stopStars() {
  starsCanvas.classList.remove("is-on");
  if (starsFrame === null) return;
  cancelAnimationFrame(starsFrame);
  starsFrame = null;
  comet = null;
  setTimeout(() => {
    if (starsFrame === null) starsCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }, 2000);
}


/* --- the room dozing off in the sleep mood --- */
const DOZE_AFTER = 25000;
const DEEPER_AFTER = 75000;

let dozeTimers = [];
let lastStir = 0;

function clearDoze() {
  dozeTimers.forEach(clearTimeout);
  dozeTimers = [];
}

function scheduleDoze() {
  clearDoze();
  if (document.body.dataset.mood !== "sleep") return;

  dozeTimers.push(
    setTimeout(() => document.body.classList.add("is-dozing"), DOZE_AFTER),
    setTimeout(() => document.body.classList.add("is-deeper"), DEEPER_AFTER)
  );
}

function stirRoom() {
  if (document.body.dataset.mood !== "sleep") return;

  const wasDim = document.body.classList.contains("is-dozing");
  if (!wasDim && Date.now() - lastStir < 1000) return;

  lastStir = Date.now();
  document.body.classList.remove("is-dozing", "is-deeper");
  scheduleDoze();
}

["pointermove", "pointerdown", "keydown", "wheel", "touchstart"].forEach((event) => {
  window.addEventListener(event, stirRoom, { passive: true });
});


/* --- the tape deck --- */
const player = document.getElementById("player");
const playerPlay = document.getElementById("player-play");
const playerNext = document.getElementById("player-next");
const playerTitle = document.getElementById("player-title");
const stationButtons = document.querySelectorAll(".station");
const radioFrame = document.getElementById("radio-frame");
const radioDial = document.getElementById("radio-dial");
const volumeSlider = document.getElementById("player-volume");

let tapeRunning = false;
let audioCtx = null;
let synth = null;

// three seconds of tape hiss with the occasional pop, looped forever
function crackleBuffer(ctx) {
  const length = ctx.sampleRate * 3;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    data[i] += (Math.random() * 2 - 1) * 0.018;

    if (Math.random() < 0.00028) {
      const amp = 0.2 + Math.random() * 0.45;
      for (let k = 0; k < 48 && i + k < length; k++) {
        data[i + k] += amp * Math.exp(-k / 11) * (Math.random() * 2 - 1);
      }
    }
  }

  return buffer;
}

function buildSynth() {
  const ctx = audioCtx;

  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const warmth = ctx.createBiquadFilter();
  warmth.type = "lowpass";
  warmth.frequency.value = 620;
  warmth.Q.value = 0.7;
  warmth.connect(master);

  // an Am7 left humming in the room
  const voices = [110, 130.81, 164.81, 196].map((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = i % 2 ? "sine" : "triangle";
    osc.frequency.value = freq;
    osc.detune.value = (i - 1.5) * 7;

    const level = ctx.createGain();
    level.gain.value = 0.12;
    osc.connect(level).connect(warmth);
    osc.start();
    return osc;
  });

  // the filter drifts, the way a tape never holds a steady speed
  const wobble = ctx.createOscillator();
  wobble.frequency.value = 0.045;
  const wobbleDepth = ctx.createGain();
  wobbleDepth.gain.value = 210;
  wobble.connect(wobbleDepth).connect(warmth.frequency);
  wobble.start();

  const crackle = ctx.createBufferSource();
  crackle.buffer = crackleBuffer(ctx);
  crackle.loop = true;
  const crackleLevel = ctx.createGain();
  crackleLevel.gain.value = 0.35;
  crackle.connect(crackleLevel).connect(master);
  crackle.start();

  return { master, sources: [...voices, wobble, crackle] };
}

function fadeSynth(target, seconds) {
  const now = audioCtx.currentTime;
  const gain = synth.master.gain;
  gain.cancelScheduledValues(now);
  gain.setValueAtTime(gain.value, now);
  gain.linearRampToValueAtTime(target, now + seconds);
}

// the synth hum sits a little lower than a real track at the same setting
function synthLevel() {
  return tapeVolume * 0.58;
}

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  audioCtx.resume();
  return audioCtx;
}

function startSynth() {
  ensureAudio();
  if (!synth) synth = buildSynth();
  fadeSynth(synthLevel(), 2.5);
}

function stopSynth() {
  if (!synth) return;
  fadeSynth(0, 1.4);

  const ending = synth;
  synth = null;
  setTimeout(() => ending.sources.forEach((node) => node.stop()), 1600);
}

/* real tapes, streamed straight from the Internet Archive */
let TAPES = [
  {
    title: "lofi lion — tame the beast",
    licence: "cc by 4.0",
    src: "https://archive.org/download/lofi-lion-tame-the-beast/LofiLion-TameTheBeast.mp3",
  },
];

// the rest of the rack lives in tapes.json, so it can grow without touching the code
async function loadTapeRack() {
  try {
    const rack = await fetch("tapes.json").then((r) => r.json());
    const shelf = rack.tapes.map((t) => ({
      title: t.title,
      licence: t.licence,
      src: rack.base + t.file,
    }));
    const extra = (rack.extra || []).map((t) => ({ ...t, src: t.url }));

    TAPES = [...shelf, ...extra];
    tapeIndex = Math.floor(Math.random() * TAPES.length);
    if (!tapeRunning) paintTape();
  } catch {
    // the one built-in tape will do
  }
}

const storedVolume = localStorage.getItem("lateNight.volume");
let tapeVolume = storedVolume === null ? 0.55 : Math.min(1, Math.max(0, Number(storedVolume) || 0));

let tapeIndex = Math.floor(Math.random() * TAPES.length);
let tapeAudio = null;
let fadeStep = null;
let onSynth = false;

function paintTape() {
  const tape = TAPES[tapeIndex];
  playerTitle.textContent = onSynth
    ? "night tape · side a"
    : `${tape.title} · ${tape.licence}`;
}

function fadeAudio(target, seconds) {
  clearInterval(fadeStep);
  const from = tapeAudio.volume;
  const steps = Math.max(1, Math.round(seconds * 25));
  let step = 0;

  fadeStep = setInterval(() => {
    step++;
    tapeAudio.volume = Math.min(1, Math.max(0, from + (target - from) * (step / steps)));
    if (step >= steps) {
      clearInterval(fadeStep);
      fadeStep = null;
      if (target === 0) tapeAudio.pause();
    }
  }, 40);
}

function loadTape() {
  if (!tapeAudio) {
    tapeAudio = new Audio();
    tapeAudio.preload = "none";
    tapeAudio.volume = 0;

    // if the archive is unreachable, the little synth takes over
    tapeAudio.addEventListener("error", () => {
      if (!tapeRunning) return;
      onSynth = true;
      paintTape();
      startSynth();
    });

    tapeAudio.addEventListener("ended", nextTape);
  }

  tapeAudio.src = TAPES[tapeIndex].src;
}

function playTape() {
  if (onSynth) {
    startSynth();
    return;
  }

  if (!tapeAudio || !tapeAudio.src) loadTape();
  tapeAudio.play().catch(() => {
    onSynth = true;
    paintTape();
    startSynth();
  });
  fadeAudio(tapeVolume, 2.5);
}

function pauseTape() {
  if (onSynth) {
    stopSynth();
    return;
  }
  if (tapeAudio) fadeAudio(0, 1.2);
}

function nextTape() {
  tapeIndex = (tapeIndex + 1) % TAPES.length;
  paintTape();

  if (onSynth || !tapeRunning) return;

  loadTape();
  tapeAudio.volume = 0;
  tapeAudio.play().catch(() => {});
  fadeAudio(tapeVolume, 2);
}

/* the other side: Lofi Girl's own streams, played in her own player.
   She restarts a broadcast now and then, which retires the old id. */
const RADIOS = [
  { key: "lofi", name: "lofi hip hop", id: "rFZHOHl-L8A" },
  { key: "house", name: "lofi house", id: "3PFJ9SETS4M" },
  { key: "synthwave", name: "synthwave", id: "4xDzrJKXOOY" },
  { key: "summer", name: "summer lofi", id: "0muHFBSiybw" },
  { key: "sleep", name: "deep sleep", id: "nI725iVsyoQ" },
];

let station = "tape";
let radioKey = localStorage.getItem("lateNight.radio") || "lofi";

function currentRadio() {
  return RADIOS.find((r) => r.key === radioKey) || RADIOS[0];
}

function buildRadioDial() {
  RADIOS.forEach((r) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "radio-channel";
    btn.dataset.radio = r.key;
    btn.textContent = r.name;
    btn.addEventListener("click", () => setRadio(r.key));
    radioDial.append(btn);
  });
}

function paintRadioDial() {
  radioDial.querySelectorAll(".radio-channel").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.radio === radioKey);
  });
}

function setRadio(key) {
  radioKey = key;
  localStorage.setItem("lateNight.radio", key);
  paintRadioDial();

  playerTitle.textContent = `lofi girl · ${currentRadio().name}`;
  closeRadio();
  openRadio();
}

function openRadio() {
  if (radioFrame.firstChild) return;

  const radio = currentRadio();
  const frame = document.createElement("iframe");
  frame.src = `https://www.youtube-nocookie.com/embed/${radio.id}?autoplay=1&rel=0`;
  frame.title = `Lofi Girl — ${radio.name} radio`;
  frame.allow = "autoplay; encrypted-media";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.loading = "lazy";
  radioFrame.append(frame);
}

function closeRadio() {
  radioFrame.replaceChildren();
}

function setStation(next) {
  station = next;
  document.body.dataset.station = next;

  stationButtons.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.station === next);
  });

  if (next === "radio") {
    if (tapeRunning) setTape(false);
    playerTitle.textContent = `lofi girl · ${currentRadio().name}`;
    paintRadioDial();
    openRadio();
  } else {
    closeRadio();
    paintTape();
  }
}

stationButtons.forEach((btn) => {
  btn.addEventListener("click", () => setStation(btn.dataset.station));
});

function setTape(running) {
  tapeRunning = running;
  player.classList.toggle("is-playing", running);
  playerPlay.textContent = running ? "pause" : "play";

  if (running) playTape();
  else pauseTape();
}

function setVolume(value, { save = true } = {}) {
  tapeVolume = Math.min(1, Math.max(0, value));
  volumeSlider.value = String(Math.round(tapeVolume * 100));

  if (tapeAudio && !tapeAudio.paused) {
    clearInterval(fadeStep);
    fadeStep = null;
    tapeAudio.volume = tapeVolume;
  }

  if (synth) fadeSynth(synthLevel(), 0.2);
  if (save) localStorage.setItem("lateNight.volume", String(tapeVolume));
}

volumeSlider.addEventListener("input", () => setVolume(Number(volumeSlider.value) / 100));

playerPlay.addEventListener("click", () => setTape(!tapeRunning));
playerNext.addEventListener("click", nextTape);

buildRadioDial();
setVolume(tapeVolume, { save: false });
setStation("tape");
loadTapeRack();



/* --- the sound of the rain: real recordings, streamed from the archive --- */
const RAIN_ARCHIVE = "https://archive.org/download/relaxingrainsounds/";

const RAIN_SOUND = {
  drizzle: { file: "Light%20Gentle%20Rain%20Part%201.mp3", level: 0.4 },
  steady: { file: "Rain%20Trickling%20Sounds%20Part%201.mp3", level: 0.55 },
  downpour: { file: "Thunderstorm%20Out%20In%20The%20Fields.mp3", level: 0.7 },
};

const rainListen = document.getElementById("rain-listen");

let rainTrack = null;
let rainFade = null;
let rainOnSynth = false;
let rainAudible = localStorage.getItem("lateNight.rainSound") === "1";

// brown noise, kept as a fallback for when the archive cannot be reached
function noiseBuffer(ctx, seconds = 4) {
  const length = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;

  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.021 * white) / 1.021;
    data[i] = last * 3.4;
  }

  return buffer;
}

let rainSynth = null;

function buildRainSynth() {
  const ctx = audioCtx;

  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  source.loop = true;

  const away = ctx.createBiquadFilter();
  away.type = "highpass";
  away.frequency.value = 280;

  const glass = ctx.createBiquadFilter();
  glass.type = "lowpass";
  glass.frequency.value = 2300;
  glass.Q.value = 0.4;

  source.connect(away).connect(glass).connect(master);
  source.start();

  return { master, sources: [source] };
}

function startRainSynth() {
  ensureAudio();
  if (!rainSynth) rainSynth = buildRainSynth();
  const now = audioCtx.currentTime;
  rainSynth.master.gain.cancelScheduledValues(now);
  rainSynth.master.gain.linearRampToValueAtTime(0.18, now + 2);
}

function stopRainSynth() {
  if (!rainSynth) return;
  const now = audioCtx.currentTime;
  rainSynth.master.gain.cancelScheduledValues(now);
  rainSynth.master.gain.setValueAtTime(rainSynth.master.gain.value, now);
  rainSynth.master.gain.linearRampToValueAtTime(0, now + 1);

  const ending = rainSynth;
  rainSynth = null;
  setTimeout(() => ending.sources.forEach((node) => node.stop()), 1300);
}

function paintRainSound() {
  rainListen.classList.toggle("is-on", rainAudible);
  rainListen.setAttribute("aria-pressed", String(rainAudible));
  rainListen.textContent = rainAudible ? "listening" : "listen";
}

function fadeRain(target, seconds, andThen) {
  clearInterval(rainFade);
  const from = rainTrack.volume;
  const steps = Math.max(1, Math.round(seconds * 25));
  let step = 0;

  rainFade = setInterval(() => {
    step++;
    rainTrack.volume = Math.min(1, Math.max(0, from + (target - from) * (step / steps)));
    if (step >= steps) {
      clearInterval(rainFade);
      rainFade = null;
      if (andThen) andThen();
    }
  }, 40);
}

function startRainSound() {
  if (!rainAudible || document.body.dataset.mood !== "rain") return;

  if (rainOnSynth) {
    startRainSynth();
    return;
  }

  if (!rainTrack) {
    rainTrack = new Audio();
    rainTrack.loop = true;
    rainTrack.preload = "none";
    rainTrack.volume = 0;

    // if the recording will not load, the old noise takes over
    rainTrack.addEventListener("error", () => {
      if (!rainAudible) return;
      rainOnSynth = true;
      startRainSynth();
    });
  }

  const shape = RAIN_SOUND[rainLevel];
  if (!rainTrack.src.endsWith(shape.file)) rainTrack.src = RAIN_ARCHIVE + shape.file;

  rainTrack.play().catch(() => {
    rainOnSynth = true;
    startRainSynth();
  });
  fadeRain(shape.level, 2.5);
}

function stopRainSound() {
  stopRainSynth();
  if (!rainTrack || rainTrack.paused) return;
  fadeRain(0, 1.2, () => rainTrack.pause());
}

// a different recording for each strength, swapped without a gap of silence
function tuneRainSound() {
  if (!rainAudible || rainOnSynth || !rainTrack || rainTrack.paused) return;

  const shape = RAIN_SOUND[rainLevel];
  if (rainTrack.src.endsWith(shape.file)) {
    fadeRain(shape.level, 1.2);
    return;
  }

  fadeRain(0, 0.8, () => {
    rainTrack.src = RAIN_ARCHIVE + shape.file;
    rainTrack.play().catch(() => {});
    fadeRain(shape.level, 1.4);
  });
}

rainListen.addEventListener("click", () => {
  rainAudible = !rainAudible;
  localStorage.setItem("lateNight.rainSound", rainAudible ? "1" : "0");
  paintRainSound();

  if (rainAudible) startRainSound();
  else stopRainSound();
});

paintRainSound();
setRainLevel(rainLevel, { save: false });

setMood(localStorage.getItem("lateNight.mood") || "calm", { save: false });
