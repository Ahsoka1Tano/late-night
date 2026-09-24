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

  if (mood === "rain") startRain();
  else stopRain();

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
  if (save) localStorage.setItem("lateNight.rain", level);
}

rainSteps.forEach((btn) => {
  btn.addEventListener("click", () => setRainLevel(btn.dataset.rain));
});

setRainLevel(rainLevel, { save: false });

window.addEventListener("resize", () => {
  if (rainFrame === null) return;
  sizeRain();
  seedDrops();
});



// no reason to keep it raining into an empty room
document.addEventListener("visibilitychange", () => {
  if (document.body.dataset.mood !== "rain") return;

  if (document.hidden && rainFrame !== null) {
    cancelAnimationFrame(rainFrame);
    rainFrame = null;
  } else if (!document.hidden) {
    startRain();
  }
});


/* --- the city drifts a little as you move --- */
const city = document.querySelector(".city");
let cityAimX = 0;
let cityAimY = 0;
let cityX = 0;
let cityY = 0;
let cityFrame = null;

function easeCity() {
  cityX += (cityAimX - cityX) * 0.045;
  cityY += (cityAimY - cityY) * 0.045;
  city.style.transform = `translate3d(${cityX.toFixed(2)}px, ${cityY.toFixed(2)}px, 0)`;

  if (Math.abs(cityAimX - cityX) < 0.05 && Math.abs(cityAimY - cityY) < 0.05) {
    cityFrame = null;
    return;
  }
  cityFrame = requestAnimationFrame(easeCity);
}

window.addEventListener("pointermove", (e) => {
  if (!calmEnough) return;
  cityAimX = (e.clientX / window.innerWidth - 0.5) * -16;
  cityAimY = (e.clientY / window.innerHeight - 0.5) * -9;
  if (cityFrame === null) cityFrame = requestAnimationFrame(easeCity);
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

  if (document.body.dataset.mood !== "rain") return;

  const step = e.key === "[" ? -1 : e.key === "]" ? 1 : 0;
  if (!step) return;

  const next = RAIN_ORDER.indexOf(rainLevel) + step;
  if (next < 0 || next >= RAIN_ORDER.length) return;

  setRainLevel(RAIN_ORDER[next]);
  retireHint();
});


/* --- focus --- */
const FOCUS_LENGTH = 25 * 60 * 1000;

const focusBlock = document.getElementById("focus");
const focusTime = document.getElementById("focus-time");
const focusToggle = document.getElementById("focus-toggle");
const focusReset = document.getElementById("focus-reset");

let focusLeft = FOCUS_LENGTH;
let focusEndsAt = null;
let focusTick = null;

function paintFocus() {
  const left = Math.max(0, focusEndsAt ? focusEndsAt - Date.now() : focusLeft);
  const total = Math.ceil(left / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  focusTime.textContent = `${mm}:${ss}`;

  if (focusEndsAt && left <= 0) finishFocus();
}

function startFocus() {
  focusEndsAt = Date.now() + focusLeft;
  focusToggle.textContent = "pause";
  focusBlock.classList.add("is-running");
  focusBlock.classList.remove("is-done");
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
  focusLeft = FOCUS_LENGTH;
  focusToggle.textContent = "start";
  focusBlock.classList.remove("is-running", "is-done");
  paintFocus();
}

function finishFocus() {
  clearInterval(focusTick);
  focusTick = null;
  focusEndsAt = null;
  focusLeft = FOCUS_LENGTH;
  focusToggle.textContent = "start";
  focusBlock.classList.remove("is-running");
  focusBlock.classList.add("is-done");
  focusTime.textContent = "00:00";
}

focusToggle.addEventListener("click", () => {
  if (focusEndsAt) pauseFocus();
  else startFocus();
});

focusReset.addEventListener("click", resetFocus);

setMood(localStorage.getItem("lateNight.mood") || "calm", { save: false });
