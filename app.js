/* Late Night — a tiny digital room for quiet evenings. */
let eveningSoundGain = 1;

const clockEl = document.getElementById("clock");
const windowClock = document.getElementById("window-clock");

function tick() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  clockEl.textContent = `${hh}:${mm}`;
  windowClock.textContent = clockEl.textContent;
  windowClock.dateTime = `${hh}:${mm}`;
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
  aurora: "Nobody else is awake to see this.",
};

const moodLine = document.getElementById("mood-line");
const moodButtons = document.querySelectorAll(".mood");
let moodLineTimer = null;
let musicRainEnabled = localStorage.getItem("lateNight.musicRain") === "1";
let windowScene = "city";
try { const saved = localStorage.getItem("lateNight.view"); if (["mountains", "coast", "cafe"].includes(saved)) windowScene = saved; } catch { /* Keep the city. */ }

function isRainScene(mood = document.body.dataset.mood) {
  return mood === "rain" || (mood === "music" && musicRainEnabled);
}

function hasStarSky(mood = document.body.dataset.mood) {
  return mood === "space" || mood === "aurora" || (["mountains", "coast"].includes(windowScene) && !isRainScene(mood));
}
function syncWindowSky() {
  if (!document.hidden && !cityMotion.matches && hasStarSky()) startStars();
  else stopStars();
}

function paintWeather() {
  document.body.classList.toggle("has-rain", isRainScene());
  document.getElementById("rain-dial").hidden = !isRainScene() && ambientChoice !== "rain";
  paintSceneCaption();
  if (isRainScene()) startRain();
  else stopRain();
  syncWindowSky();
}

function paintSceneCaption() {
  const mood = document.body.dataset.mood;
  if (windowScene === "cafe") {
    document.getElementById("scene-caption").textContent = isRainScene() ? "WARM WINDOWS. RAIN BETWEEN US." : "SOMEWHERE, THE KETTLE IS STILL ON.";
    return;
  }
  if (windowScene === "coast") {
    document.getElementById("scene-caption").textContent = isRainScene() ? "RAIN ON THE GLASS. LIGHTS ACROSS THE BAY." : "THE SHORE IS STILL AWAKE.";
    return;
  }
  if (windowScene === "mountains") {
    document.getElementById("scene-caption").textContent = isRainScene()
      ? "RAIN ON THE GLASS. PEAKS IN THE DISTANCE." : "A LITTLE FURTHER FROM EVERYTHING.";
    return;
  }
  document.getElementById("scene-caption").textContent = mood === "music" && musicRainEnabled
    ? "TAPES INSIDE. RAIN OUTSIDE."
    : { calm: "A SOFTER LIGHT. A SLOWER NIGHT.", music: "THE CITY IS KEEPING YOU COMPANY",
        focus: "JUST YOU AND ONE SMALL THING", rain: "NOWHERE ELSE YOU NEED TO BE",
        space: "THE CITY FALLS AWAY", sleep: "THE LAST LIGHTS ARE GOING OUT",
        aurora: "SOMETHING QUIETLY EXTRAORDINARY" }[mood];
}

function setMood(mood, { save = true } = {}) {
  if (!MOODS[mood]) mood = "calm";
  document.body.dataset.mood = mood;
  syncCityLife();
  document.getElementById("desk-title").textContent = {
    calm: "A softer pace.", music: "Let the evening play.", focus: "One thing at a time.",
    rain: "Weather for staying in.", space: "A little further away.", sleep: "Let the day go.", aurora: "An unexpected sky.",
  }[mood];
  document.getElementById("player").hidden = mood !== "music";
  document.getElementById("weather-mix").hidden = mood !== "music";
  document.getElementById("focus").hidden = mood !== "focus";
  document.getElementById("radio-dial").hidden = mood !== "music" || station !== "radio";
  document.getElementById("radio-frame").hidden = mood !== "music" || station !== "radio";

  moodButtons.forEach((btn) => {
    const picked = btn.dataset.mood === mood;
    btn.classList.toggle("is-active", picked);
    btn.setAttribute("aria-pressed", String(picked));

    // a short flare, so a keyboard pick is as visible as a click
    if (picked && save) {
      btn.classList.remove("just-picked");
      void btn.offsetWidth;
      btn.classList.add("just-picked");
    }
  });

  clearTimeout(moodLineTimer);
  moodLine.classList.add("is-fading");
  moodLineTimer = setTimeout(() => {
    moodLine.textContent = MOODS[mood];
    moodLine.classList.remove("is-fading");
    moodLineTimer = null;
  }, 300);

  paintWeather();

  swapAmbience();

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
  swapAmbience();
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

  if (isRainScene(mood)) startRain();
  syncWindowSky();
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

// when you leave, everything settles back to where it was
function settleDrift() {
  if (!calmEnough) return;
  driftAimX = 0;
  driftAimY = 0;
  if (driftFrame === null) driftFrame = requestAnimationFrame(easeDrift);
}

document.addEventListener("pointerleave", settleDrift);
window.addEventListener("blur", settleDrift);


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

  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
  if (typing || document.activeElement?.closest(".journal-history")) return;

  const number = Number(e.key);
  if (number >= 1 && number <= moodButtons.length) {
    const wanted = moodButtons[number - 1];
    if (wanted.offsetParent !== null) {
      setMood(wanted.dataset.mood);
      retireHint();
      return;
    }
  }

  if (document.body.dataset.mood === "focus" && (e.key === " " || e.code === "Space")
      && !document.activeElement?.closest("button, summary, select")) {
    e.preventDefault();
    if (focusEndsAt) pauseFocus();
    else startFocus();
    retireHint();
    return;
  }

  // the arrows turn whatever is playing in this room
  const nudge = e.key === "ArrowUp" ? 0.05 : e.key === "ArrowDown" ? -0.05 : 0;
  if (nudge) {
    const mood = document.body.dataset.mood;

    if (mood === "music" && station === "tape") {
      e.preventDefault();
      setVolume(tapeVolume + nudge);
      retireHint();
      return;
    }

    if (listening && ambienceFor(mood)) {
      e.preventDefault();
      setRoomVolume(roomVolume + nudge);
      retireHint();
      return;
    }
  }

  if (!isRainScene()) return;

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
let focusPhase = "focus";
let savedFocusSession = null;
let focusReady = false;
try { savedFocusSession = JSON.parse(localStorage.getItem("lateNight.focusSession")); } catch {}

function focusLength() {
  return (focusPhase === "break" ? 5 : focusMinutes) * 60 * 1000;
}

const focusBlock = document.getElementById("focus");
const focusTime = document.getElementById("focus-time");
const focusProgress = document.getElementById("focus-progress");
const focusToggle = document.getElementById("focus-toggle");
const focusReset = document.getElementById("focus-reset");
const focusNote = document.getElementById("focus-note");
const focusIntention = document.getElementById("focus-intention");
const windowFocus = document.getElementById("window-focus");
const windowFocusTime = document.getElementById("window-focus-time");
const windowFocusToggle = document.getElementById("window-focus-toggle");
try { focusIntention.value = (localStorage.getItem("lateNight.intention") || "").slice(0, 100); } catch {}
function paintWindowFocus() {
  const shown = document.body.dataset.mood === "focus" || Boolean(focusEndsAt) || focusLeft < focusLength() || focusBlock.classList.contains("is-done");
  windowFocus.hidden = !shown;
  document.body.classList.toggle("has-window-focus", shown);
  windowFocusTime.textContent = focusTime.textContent;
  windowFocus.dataset.phase = focusPhase;
  windowFocus.style.setProperty("--session-progress", focusProgress.style.getPropertyValue("--progress") || 0);
  const done = focusBlock.classList.contains("is-done");
  document.getElementById("window-focus-task").textContent = focusPhase === "break" ? "Look outside. Let your shoulders drop." : focusIntention.value.trim() || "Nothing else needs doing.";
  windowFocusToggle.textContent = focusEndsAt ? "pause" : done ? "once more" : focusPhase === "break" ? "start break" : "start session";
  document.getElementById("window-focus-label").textContent = focusPhase === "break" ? done ? "COME BACK WHEN YOU FEEL LIKE IT" : "FIVE MINUTES FOR YOURSELF" : done ? "ENOUGH FOR NOW" : focusEndsAt ? "JUST THIS. JUST NOW." : "ONE SMALL THING";
  document.querySelectorAll("[data-focus-break]").forEach(button => {
    button.hidden = focusPhase !== "break" && !done;
    button.textContent = focusPhase === "break" ? "back to focus" : "take five minutes";
  });
  focusPresets.forEach(button => { button.disabled = Boolean(focusEndsAt); });
}
focusIntention.addEventListener("input", () => {
  try {
    localStorage.setItem("lateNight.intention", focusIntention.value);
    document.getElementById("focus-intention-note").textContent = "";
  } catch { document.getElementById("focus-intention-note").textContent = "Kept for this visit. Device storage unavailable."; }
  paintWindowFocus();
});
new MutationObserver(paintWindowFocus).observe(document.body, { attributes: true, attributeFilter: ["data-mood"] });

let focusLeft = focusLength();
let focusEndsAt = null;
let focusTick = null;

const BASE_TITLE = document.title;
function saveFocusSession() {
  if (!focusReady) return;
  try {
    localStorage.setItem("lateNight.focusSession", JSON.stringify({
      minutes: focusMinutes, phase: focusPhase, left: focusLeft,
      endsAt: focusEndsAt, done: focusBlock.classList.contains("is-done")
    }));
  } catch {
    focusNote.textContent = "Timer stays here. Device storage unavailable.";
    focusNote.classList.add("is-warning");
  }
}

function restoreFocusSession() {
  const saved = savedFocusSession;
  const length = (saved?.phase === "break" ? 5 : saved?.minutes) * 60000;
  if (saved && FOCUS_PRESETS.includes(saved.minutes) && ["focus", "break"].includes(saved.phase)
      && Number.isFinite(saved.left) && saved.left > 0 && saved.left <= length
      && typeof saved.done === "boolean" && (saved.endsAt === null ||
        Number.isFinite(saved.endsAt) && saved.endsAt > 0 && saved.endsAt <= Date.now() + length)
      && !(saved.done && saved.endsAt !== null)) {
    setFocusLength(saved.minutes, { save: false });
    focusPhase = saved.phase;
    focusLeft = saved.left;
    focusEndsAt = saved.endsAt;
    focusBlock.classList.toggle("is-done", saved.done);
    focusBlock.classList.toggle("is-running", Boolean(focusEndsAt));
    focusToggle.textContent = focusEndsAt ? "pause" : "start";
    if (saved.done) focusNote.textContent = focusPhase === "break" ? "No rush to begin again." : `that was ${focusMinutes} quiet minutes`;
    if (focusEndsAt) focusTick = setInterval(paintFocus, 250);
  }
  focusReady = true;
  paintFocus();
}

function paintFocus() {
  const left = focusBlock.classList.contains("is-done") ? 0 : Math.max(0, focusEndsAt ? focusEndsAt - Date.now() : focusLeft);
  const total = Math.ceil(left / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  focusTime.textContent = `${mm}:${ss}`;
  const progress = Math.min(1, Math.max(0, 1 - left / focusLength()));
  focusProgress.style.setProperty("--progress", progress);
  focusProgress.setAttribute("aria-valuenow", String(Math.round(progress * 100)));

  // so the session is still visible from another window
  document.title = focusEndsAt ? `${mm}:${ss} — ${BASE_TITLE}` : BASE_TITLE;

  if (focusEndsAt && left <= 0) finishFocus();
  paintWindowFocus();
}

function startFocus() {
  if (focusEndsAt) return;
  focusEndsAt = Date.now() + focusLeft;
  focusToggle.textContent = "pause";
  focusBlock.classList.add("is-running");
  focusBlock.classList.remove("is-done");
  focusNote.textContent = "";
  focusNote.classList.remove("is-warning");
  focusTick = setInterval(paintFocus, 250);
  saveFocusSession();
  paintFocus();
}

function pauseFocus() {
  if (!focusEndsAt) return;
  if (focusEndsAt <= Date.now()) { finishFocus(); return; }
  focusLeft = Math.max(0, focusEndsAt - Date.now());
  focusEndsAt = null;
  clearInterval(focusTick);
  focusTick = null;
  focusToggle.textContent = "start";
  focusBlock.classList.remove("is-running");
  saveFocusSession();
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
  focusNote.classList.remove("is-warning");
  saveFocusSession();
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
  focusNote.textContent = focusPhase === "break" ? "No rush to begin again." : `that was ${focusMinutes} quiet minutes`;
  // Save the completed state before counting so a refresh cannot count it again.
  saveFocusSession();
  if (focusPhase === "focus") {
    try { keepSession(focusMinutes); } catch {
      focusNote.textContent += " · Stats could not be saved on this device.";
      focusNote.classList.add("is-warning");
    }
  }
  focusProgress.style.setProperty("--progress", 1);
  focusProgress.setAttribute("aria-valuenow", "100");
  paintWindowFocus();
}

const focusPresets = document.querySelectorAll(".focus-preset");

function setFocusLength(minutes, { save = true } = {}) {
  if (!FOCUS_PRESETS.includes(minutes)) minutes = 25;
  focusMinutes = minutes;
  focusPhase = "focus";

  focusPresets.forEach((btn) => {
    btn.classList.toggle("is-active", Number(btn.dataset.minutes) === minutes);
  });

  resetFocus();
  if (save) {
    try { localStorage.setItem("lateNight.focusMinutes", String(minutes)); } catch {}
  }
}

focusPresets.forEach((btn) => {
  btn.addEventListener("click", () => setFocusLength(Number(btn.dataset.minutes)));
});

focusToggle.addEventListener("click", () => {
  if (focusEndsAt) pauseFocus();
  else startFocus();
});

focusReset.addEventListener("click", resetFocus);
windowFocusToggle.addEventListener("click", () => {
  if (focusEndsAt) pauseFocus();
  else startFocus();
});
document.querySelectorAll("[data-focus-break]").forEach(button => button.addEventListener("click", () => {
  if (focusPhase === "break") {
    focusPhase = "focus";
    resetFocus();
  } else {
    focusPhase = "break";
    resetFocus();
    startFocus();
  }
}));

setFocusLength(focusMinutes, { save: false });
document.addEventListener("visibilitychange", () => { if (!document.hidden) paintFocus(); });

/* A quiet room keeps the same scene and audio; Escape brings the desk back. */
const quietRoomButton = document.getElementById("quiet-room");
function setQuietRoom(on) {
  document.body.classList.toggle("is-quiet", on);
  quietRoomButton.setAttribute("aria-pressed", String(on));
  quietRoomButton.textContent = on ? "← back to the room" : "◌ quiet room";
  quietRoomButton.focus({ preventScroll: true });
  document.getElementById("window-view").scrollIntoView({ block: "center", behavior: "instant" });
  window.dispatchEvent(new Event("resize"));
}
quietRoomButton.addEventListener("click", () => setQuietRoom(!document.body.classList.contains("is-quiet")));
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && document.body.classList.contains("is-quiet")) {
    setQuietRoom(false);
  }
});


/* A short, optional rhythm, independent of music and focus statistics. */
const breathPanel = document.getElementById("breathing-ritual");
const BREATH_PACES = { gentle: [4000,6000], even: [4000,4000] };
let breathMinutes = 1;
let breathPace = "gentle";
try {
  const saved = JSON.parse(localStorage.getItem("lateNight.breathing"));
  if (saved && [1,3,5].includes(saved.minutes) && Object.hasOwn(BREATH_PACES,saved.pace)) {
    breathMinutes = saved.minutes;
    breathPace = saved.pace;
  }
} catch {}
let breathState = "idle";
let breathElapsed = 0;
let breathStartedAt = null;
let breathTick = null;
let breathLength = breathMinutes * 60000;
function breathElapsedNow() {
  return Math.min(breathLength, breathElapsed + (breathState === "running" ? Math.max(0, Date.now() - breathStartedAt) : 0));
}
function paintBreathing() {
  const elapsed = breathElapsedNow();
  if (breathState === "running" && elapsed >= breathLength) {
    breathElapsed = breathLength;
    breathState = "done";
    breathStartedAt = null;
    clearInterval(breathTick);
    breathTick = null;
    document.getElementById("breath-note").textContent = "A little space. Come back whenever you like.";
    if (document.body.dataset.mood === "sleep") scheduleDoze();
  }
  const [inTime,outTime] = BREATH_PACES[breathPace];
  const cycle = elapsed % (inTime + outTime);
  const incoming = cycle < inTime;
  const fraction = incoming ? cycle / inTime : 1 - (cycle - inTime) / outTime;
  const phase = breathState === "idle" ? "your own pace is fine" : breathState === "done" ? "just be here" : breathState === "paused" ? "stillness" : incoming ? "breathe in" : "breathe out";
  const seconds = Math.ceil((breathLength - elapsed) / 1000);
  const time = `${String(Math.floor(seconds / 60)).padStart(2,"0")}:${String(seconds % 60).padStart(2,"0")}`;
  const growth = breathState === "idle" || breathState === "done" ? .65 : .6 + .4 * (1 - Math.cos(Math.PI * fraction)) / 2;
  document.documentElement.style.setProperty("--breath-growth", String(growth));
  // Announce phase changes once, without rebuilding live text on every light tick.
  document.querySelectorAll("[data-breath-phase]").forEach(element => { if (element.textContent !== phase) element.textContent = phase; });
  document.querySelectorAll("[data-breath-time]").forEach(element => { if (element.textContent !== time) element.textContent = time; });
  document.querySelectorAll("[data-breath-toggle]").forEach(button => { button.textContent = breathState === "running" ? "pause" : breathState === "paused" ? "continue" : breathState === "done" ? "once more" : "begin"; });
  breathPanel.hidden = document.body.dataset.mood !== "calm" && breathState === "idle";
  breathPanel.dataset.state = breathState;
  document.getElementById("window-breathing").hidden = breathState === "idle";
  document.body.classList.toggle("has-breath-ritual", breathState !== "idle");
  document.getElementById("breath-arrive").textContent = breathState === "running" || breathState === "paused" ? "◯ back to the rhythm" : "◯ take a breath";
  document.querySelectorAll("button[data-breath-minutes],button[data-breath-pace]").forEach(button => {
    button.disabled = breathState === "running" || breathState === "paused";
    button.setAttribute("aria-pressed", String(button.dataset.breathMinutes ? Number(button.dataset.breathMinutes) === breathMinutes : button.dataset.breathPace === breathPace));
  });
}
function startBreathing() {
  if (breathState === "running" || document.hidden) return;
  if (breathState === "done") breathElapsed = 0;
  breathStartedAt = Date.now();
  breathState = "running";
  if (document.body.dataset.mood === "sleep") {
    clearDoze();
    document.body.classList.remove("is-dozing", "is-deeper");
  }
  document.getElementById("breath-note").textContent = "A little space, at your own pace.";
  breathTick = setInterval(paintBreathing, 100);
  paintBreathing();
}
function pauseBreathing() {
  if (breathState !== "running") return;
  if (breathElapsedNow() >= breathLength) { paintBreathing(); return; }
  breathElapsed = breathElapsedNow();
  breathStartedAt = null;
  breathState = "paused";
  clearInterval(breathTick);
  breathTick = null;
  document.getElementById("breath-note").textContent = "Paused. No need to catch up.";
  if (document.body.dataset.mood === "sleep") scheduleDoze();
  paintBreathing();
}
function resetBreathing() {
  clearInterval(breathTick);
  breathTick = null;
  breathElapsed = 0;
  breathStartedAt = null;
  breathState = "idle";
  if (document.body.dataset.mood === "sleep") scheduleDoze();
  document.getElementById("breath-note").textContent = "A quiet rhythm. Nothing to achieve.";
  paintBreathing();
  if (breathPanel.hidden || document.activeElement?.closest("#window-breathing")) document.getElementById("breath-arrive").focus({preventScroll:true});
}
document.querySelectorAll("[data-breath-toggle]").forEach(button => button.addEventListener("click", () => breathState === "running" ? pauseBreathing() : startBreathing()));
document.querySelectorAll("[data-breath-reset]").forEach(button => button.addEventListener("click", resetBreathing));
document.getElementById("breath-arrive").addEventListener("click", () => {
  if (breathState === "idle" || breathState === "done") startBreathing();
  document.getElementById("window-view").scrollIntoView({block:"center",behavior:"instant"});
  document.querySelector("#window-breathing [data-breath-toggle]").focus({preventScroll:true});
});
document.querySelectorAll("button[data-breath-minutes],button[data-breath-pace]").forEach(button => button.addEventListener("click", () => {
  if (breathState === "running" || breathState === "paused") return;
  if (button.dataset.breathMinutes) breathMinutes = Number(button.dataset.breathMinutes);
  else breathPace = button.dataset.breathPace;
  breathLength = breathMinutes * 60000;
  resetBreathing();
  try { localStorage.setItem("lateNight.breathing",JSON.stringify({minutes:breathMinutes,pace:breathPace})); }
  catch { document.getElementById("breath-note").textContent = "Kept for this visit. Device storage unavailable."; }
}));
new MutationObserver(paintBreathing).observe(document.body, {attributes:true, attributeFilter:["data-mood"]});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && breathState === "running") {
    pauseBreathing();
    if (breathState === "paused") document.getElementById("breath-note").textContent = "Paused while you were away. Continue whenever you like.";
  }
});
paintBreathing();

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
const journalCount = document.getElementById("journal-count");
const journalKept = document.getElementById("journal-kept");
const journalHistory = document.getElementById("journal-history");
const journalHistoryList = document.getElementById("journal-history-list");
const journalHistoryNote = document.getElementById("journal-history-note");
const journalOlder = document.getElementById("journal-older");
let journalHistoryLimit = 7;
const journalMoods = new Set(Array.from(journalChips, (chip) => chip.dataset.day));
let journalDate = today();
let journalMood = null;
let journalDirty = false;
let keptTimer = null;

function showJournalStatus(message, failed = false) {
  clearTimeout(keptTimer);
  journalKept.textContent = message;
  journalKept.classList.toggle("is-error", failed);
  journalKept.classList.add("is-shown");
  if (!failed) keptTimer = setTimeout(() => journalKept.classList.remove("is-shown"), 2200);
}

function readJournal() {
  const raw = localStorage.getItem("lateNight.journal");
  if (raw === null) return {};
  const entries = JSON.parse(raw);
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    throw new Error("Unreadable journal");
  }
  return entries;
}

// Save the note and mood together, before another click can repaint the editor.
function saveJournal() {
  try {
    const all = readJournal();
    if (journalNote.value.trim() || journalMood) {
      all[journalDate] = { note: journalNote.value, day: journalMood };
    } else {
      delete all[journalDate];
    }
    localStorage.setItem("lateNight.journal", JSON.stringify(all));
    journalDirty = false;
    showJournalStatus("saved on this device");
    if (journalHistory.open && historyView === "album") renderNightAlbum();
    return true;
  } catch {
    showJournalStatus("couldn't save · keep this tab open", true);
    return false;
  }
}

function paintJournal() {
  journalChips.forEach((chip) => {
    const picked = chip.dataset.day === journalMood;
    chip.classList.toggle("is-active", picked);
    chip.setAttribute("aria-pressed", String(picked));
  });
  journalCount.textContent = `${journalNote.value.length} / ${journalNote.maxLength}`;
}

function restoreJournal(date = journalDate) {
  try {
    const entry = readJournal()[date];
    journalDate = date;
    journalNote.value = typeof entry?.note === "string" ? entry.note : "";
    journalMood = journalMoods.has(entry?.day) ? entry.day : null;
    clearTimeout(keptTimer);
    journalKept.textContent = "";
    journalKept.classList.remove("is-shown", "is-error");
  } catch {
    showJournalStatus("saved notes unavailable · keep this tab open", true);
    return false;
  }
  paintJournal();
  return true;
}

journalChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    // clicking the same one again takes it back
    journalMood = journalMood === chip.dataset.day ? null : chip.dataset.day;
    journalDirty = true;
    paintJournal();
    saveJournal();
  });
});

journalNote.addEventListener("input", () => {
  journalDirty = true;
  paintJournal();
  saveJournal();
});

// Retry a failed write on blur; a late-night draft keeps its original date.
journalNote.addEventListener("blur", () => {
  if (journalDirty) saveJournal();
});
window.addEventListener("pagehide", () => {
  if (journalDirty) saveJournal();
});

function refreshJournalDay() {
  if (document.hidden || today() === journalDate) return;
  if (journalDirty && !saveJournal()) return;
  if (!restoreJournal(today())) return;
  document.getElementById("tonight").textContent = lineForDay(journalDate);
  if (journalHistory.open) renderJournalHistory();
}

document.addEventListener("visibilitychange", refreshJournalDay);
window.addEventListener("focus", refreshJournalDay);
restoreJournal();

// Old keys are deliberately kept as YYYY-M-D; compare dates, not strings.
function journalEntryDate(key) {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(key);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function renderJournalHistory() {
  if (historyView === "album") renderNightAlbum();
  journalHistoryList.replaceChildren();
  journalOlder.hidden = true;
  let nights;
  try {
    const currentDate = journalEntryDate(journalDate);
    nights = Object.entries(readJournal()).map(([key, entry]) => ({
      date: journalEntryDate(key),
      note: typeof entry?.note === "string" ? entry.note : "",
      mood: journalMoods.has(entry?.day) ? entry.day : null,
    })).filter(entry => entry.date && entry.date < currentDate && (entry.note.trim() || entry.mood))
      .sort((a, b) => b.date - a.date);
  } catch {
    journalHistoryNote.textContent = "Saved nights couldn't be read. Close and reopen this list to retry.";
    return;
  }

  if (!nights.length) {
    journalHistoryNote.textContent = "Past notes will appear here after your next evening.";
    return;
  }

  const shown = nights.slice(0, journalHistoryLimit);
  const dateFormat = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });
  shown.forEach(entry => {
    const item = document.createElement("li");
    item.className = "journal-entry";
    item.tabIndex = -1;
    const heading = document.createElement("div");
    heading.className = "journal-entry-heading";
    const time = document.createElement("time");
    time.dateTime = `${entry.date.getFullYear()}-${String(entry.date.getMonth() + 1).padStart(2, "0")}-${String(entry.date.getDate()).padStart(2, "0")}`;
    time.textContent = dateFormat.format(entry.date);
    heading.append(time);
    if (entry.mood) {
      const mood = document.createElement("span");
      mood.className = "journal-entry-mood";
      mood.textContent = Array.from(journalChips).find(chip => chip.dataset.day === entry.mood).textContent.trim();
      heading.append(mood);
    }
    item.append(heading);
    if (entry.note.trim()) {
      const note = document.createElement("p");
      note.className = "journal-entry-note";
      note.textContent = entry.note;
      item.append(note);
    }
    journalHistoryList.append(item);
  });
  journalHistoryNote.textContent = `${shown.length} of ${nights.length} saved ${nights.length === 1 ? "evening" : "evenings"} · on this device`;
  journalOlder.hidden = shown.length === nights.length;
}

/* An album reads the same local notes, without changing the editor. */
let historyView = "list";
try { if (localStorage.getItem("lateNight.historyView") === "album") historyView = "album"; } catch {}
let albumMonth = null;
let albumSelected = null;
let albumEntries = [];
function albumDateKey(date) { return `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`; }
function savedAlbumEntries() {
  return Object.entries(readJournal()).map(([key,value]) => ({
    date:journalEntryDate(key),note:typeof value?.note === "string" ? value.note : "",mood:journalMoods.has(value?.day) ? value.day : null
  })).filter(entry => entry.date && (entry.note.trim() || entry.mood)).sort((a,b) => b.date - a.date);
}
function paintAlbumLetter() {
  const entry = albumEntries.find(item => albumDateKey(item.date) === albumSelected);
  document.getElementById("album-letter").hidden = !entry;
  if (!entry) {
    document.getElementById("album-note").textContent = "";
    return;
  }
  document.getElementById("album-letter").dataset.emotion = entry.mood || "quiet";
  const time = document.getElementById("album-date");
  time.textContent = new Intl.DateTimeFormat(undefined,{year:"numeric",month:"long",day:"numeric"}).format(entry.date);
  time.dateTime = `${entry.date.getFullYear()}-${String(entry.date.getMonth()+1).padStart(2,"0")}-${String(entry.date.getDate()).padStart(2,"0")}`;
  const symbols = { good:"✧", normal:"○", tired:"☁", productive:"✦", quiet:"☾" };
  document.getElementById("album-emotion").textContent = entry.mood ? `${symbols[entry.mood]} ${entry.mood}` : "a night of your own";
  document.getElementById("album-note").textContent = entry.note.trim() ? entry.note : "A feeling was enough that evening.";
  const index = albumEntries.indexOf(entry);
  document.getElementById("album-older").disabled = index >= albumEntries.length-1;
  document.getElementById("album-newer").disabled = index <= 0;
}
function renderNightAlbum() {
  const status = document.getElementById("album-status");
  const days = document.getElementById("album-days");
  const focusedDay = document.activeElement?.dataset.albumDate;
  days.replaceChildren();
  try { albumEntries = savedAlbumEntries(); }
  catch {
    albumEntries = [];
    document.getElementById("album-letter").hidden = true;
    document.getElementById("album-prev").disabled = true;
    document.getElementById("album-next").disabled = true;
    document.getElementById("download-journal").disabled = true;
    status.textContent = "Saved nights couldn't be read. Close and reopen to retry.";
    return;
  }
  if (!albumMonth) {
    const latest = albumEntries[0]?.date || new Date();
    albumMonth = new Date(latest.getFullYear(),latest.getMonth(),1,12);
    albumSelected = albumEntries[0] ? albumDateKey(albumEntries[0].date) : null;
  }
  document.getElementById("download-journal").disabled = albumEntries.length === 0;
  const oldestMonth = albumEntries.at(-1)?.date;
  const newestMonth = albumEntries[0]?.date;
  if (oldestMonth && albumMonth.getFullYear()*12+albumMonth.getMonth() < oldestMonth.getFullYear()*12+oldestMonth.getMonth()) albumMonth = new Date(oldestMonth.getFullYear(),oldestMonth.getMonth(),1,12);
  if (newestMonth && albumMonth.getFullYear()*12+albumMonth.getMonth() > newestMonth.getFullYear()*12+newestMonth.getMonth()) albumMonth = new Date(newestMonth.getFullYear(),newestMonth.getMonth(),1,12);
  const year = albumMonth.getFullYear(), month = albumMonth.getMonth();
  const monthEntries = albumEntries.filter(entry => entry.date.getFullYear() === year && entry.date.getMonth() === month);
  if (!monthEntries.some(entry => albumDateKey(entry.date) === albumSelected)) albumSelected = monthEntries[0] ? albumDateKey(monthEntries[0].date) : null;
  document.getElementById("album-month-title").textContent = new Intl.DateTimeFormat(undefined,{year:"numeric",month:"long"}).format(albumMonth);
  const earliest = albumEntries.at(-1)?.date || new Date();
  const latest = albumEntries[0]?.date || new Date();
  document.getElementById("album-prev").disabled = year * 12 + month <= earliest.getFullYear() * 12 + earliest.getMonth();
  document.getElementById("album-next").disabled = year * 12 + month >= latest.getFullYear() * 12 + latest.getMonth();
  for (let blank = 0; blank < (albumMonth.getDay()+6)%7; blank++) {
    const spacer = document.createElement("span"); spacer.setAttribute("aria-hidden","true"); days.append(spacer);
  }
  for (let day = 1; day <= new Date(year,month+1,0,12).getDate(); day++) {
    const date = new Date(year,month,day,12), key = albumDateKey(date);
    const entry = albumEntries.find(item => albumDateKey(item.date) === key);
    const button = document.createElement("button");
    button.type = "button"; button.textContent = String(day); button.dataset.albumDate = key;
    button.disabled = !entry;
    button.setAttribute("aria-label",`${new Intl.DateTimeFormat(undefined,{month:"long",day:"numeric",year:"numeric"}).format(date)}${entry ? ` · ${entry.mood || "saved note"}` : " · no note"}`);
    button.setAttribute("aria-pressed",String(key === albumSelected));
    if (key === today()) button.setAttribute("aria-current","date");
    if (entry) button.dataset.emotion = entry.mood || "note";
    button.addEventListener("click",() => {
      albumSelected = key;
      days.querySelectorAll("button").forEach(item => item.setAttribute("aria-pressed",String(item.dataset.albumDate === key)));
      paintAlbumLetter();
    });
    days.append(button);
  }
  status.textContent = monthEntries.length ? "Choose a marked evening. Your words stay on this device." : albumEntries.length ? "No saved evenings in this month." : "No saved notes yet. A quiet page is fine too.";
  paintAlbumLetter();
  if (focusedDay) {
    const target = Array.from(days.querySelectorAll("button:not(:disabled)")).find(button => button.dataset.albumDate === focusedDay) || days.querySelector("button[aria-pressed='true']:not(:disabled)");
    target?.focus({preventScroll:true});
  }
}
document.getElementById("album-prev").addEventListener("click",() => { albumMonth = new Date(albumMonth.getFullYear(),albumMonth.getMonth()-1,1,12); renderNightAlbum(); });
document.getElementById("album-next").addEventListener("click",() => { albumMonth = new Date(albumMonth.getFullYear(),albumMonth.getMonth()+1,1,12); renderNightAlbum(); });
function setHistoryView(view, { save = true } = {}) {
  historyView = view === "album" ? "album" : "list";
  document.getElementById("night-album").hidden = historyView !== "album";
  document.getElementById("journal-list-view").hidden = historyView !== "list";
  document.querySelectorAll("[data-history-view]").forEach(button => button.setAttribute("aria-pressed",String(button.dataset.historyView === historyView)));
  if (historyView === "album" && journalHistory.open) renderNightAlbum();
  if (save) { try { localStorage.setItem("lateNight.historyView",historyView); } catch {} }
}
document.querySelectorAll("[data-history-view]").forEach(button => button.addEventListener("click",() => setHistoryView(button.dataset.historyView)));
function browseAlbumNight(direction) {
  const index = albumEntries.findIndex(entry => albumDateKey(entry.date) === albumSelected);
  const entry = albumEntries[index+direction];
  if (!entry) return;
  albumSelected = albumDateKey(entry.date);
  albumMonth = new Date(entry.date.getFullYear(),entry.date.getMonth(),1,12);
  renderNightAlbum();
}
document.getElementById("album-older").addEventListener("click",() => browseAlbumNight(1));
document.getElementById("album-newer").addEventListener("click",() => browseAlbumNight(-1));
setHistoryView(historyView,{save:false});
document.getElementById("download-journal").addEventListener("click",() => {
  const status = document.getElementById("album-download-status");
  try {
    const saved = savedAlbumEntries();
    if (!saved.length) { status.textContent = "There are no saved notes to download yet."; return; }
    const iso = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
    const text = "LATE NIGHT\nA little collection of saved evenings.\n\n" + saved.map(entry => `${iso(entry.date)}${entry.mood ? ` · ${entry.mood}` : ""}\n${entry.note.trim() ? entry.note : "A feeling was enough that evening."}`).join("\n\n———\n\n") + "\n";
    const url = URL.createObjectURL(new Blob(["\ufeff",text],{type:"text/plain;charset=utf-8"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = `late-night-notes-${iso(new Date())}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url),1000);
    status.textContent = "Text file prepared. Keep it wherever you like.";
  } catch { status.textContent = "Saved notes couldn't be read. Reopen the album to retry."; }
});

journalHistory.addEventListener("toggle", () => {
  document.body.classList.toggle("is-reading-journal", journalHistory.open);
  if (!journalHistory.open) return;
  journalHistoryLimit = 7;
  renderJournalHistory();
});

journalOlder.addEventListener("click", () => {
  const previousCount = journalHistoryList.children.length;
  journalHistoryLimit += 7;
  renderJournalHistory();
  journalHistoryList.children[previousCount]?.focus();
});

window.addEventListener("storage", event => {
  if ((event.key === "lateNight.journal" || event.key === null) && journalHistory.open) renderJournalHistory();
});


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
let nextCometAt = Date.now() + 65000 + Math.random() * 45000;

function maybeComet() {
  if (comet || Date.now() < nextCometAt) return;
  launchComet();
}
function launchComet() {
  if (comet || starsFrame === null || document.hidden || cityMotion.matches || !hasStarSky()) return false;
  const x = Math.random() * window.innerWidth * .25;
  const y = window.innerHeight * (.07 + Math.random() * .1);
  comet = {
    x, y, startX: x, startY: y, startedAt: Date.now(),
    vx: window.innerWidth * .005, vy: window.innerHeight * .0013, life: 1,
  };
  nextCometAt = Date.now() + 65000 + Math.random() * 45000;
  return true;
}

function drawComet() {
  if (!comet) return;
  const frames = Math.max(0, (Date.now() - comet.startedAt) / (1000 / 60));
  comet.x = comet.startX + comet.vx * frames;
  comet.y = comet.startY + comet.vy * frames;
  comet.life = Math.max(0, 1 - frames / 125);
  if (!comet.life || comet.x > window.innerWidth + 60) { comet = null; return; }

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
  if (cityMotion.matches || starsFrame !== null) return;
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
  if (document.body.dataset.mood !== "sleep" || breathState === "running") return;

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

    const current = TAPES[tapeIndex];
    const rackTapes = [...shelf, ...extra];
    if (!rackTapes.length) return;
    if ((tapeRunning || tapeAudio || rememberedTape() === current.src)
        && !rackTapes.some(tape => tape.src === current.src)) rackTapes.unshift(current);
    TAPES = rackTapes;
    const wanted = tapeRunning ? current.src : rememberedTape();
    const restored = TAPES.findIndex(tape => tape.src === wanted);
    tapeIndex = restored >= 0 ? restored : Math.floor(Math.random() * TAPES.length);
    if (!tapeRunning && TAPES[tapeIndex].src !== current.src) {
      ++tapeRequest;
      clearInterval(fadeStep);
      tapeAudio?.pause();
      tapeAudio = null;
    }
    paintTapeShelf();
    if (!tapeRunning && station === "tape") paintTape();
  } catch {
    // the one built-in tape will do
  }
}

const storedVolume = localStorage.getItem("lateNight.volume");
let tapeVolume = storedVolume === null ? 0.55 : Math.min(1, Math.max(0, Number(storedVolume) || 0));

let tapeIndex = Math.floor(Math.random() * TAPES.length);
let tapeAudio = null;
let fadeStep = null;
let tapeState = "idle";
let tapeError = "";
let tapeRequest = 0;
const tapeShelf = document.getElementById("tape-shelf");
const tapeChoice = document.getElementById("tape-choice");
const tapeKeep = document.getElementById("tape-keep");
const tapeFilter = document.getElementById("tape-filter");
const tapeKeptNote = document.getElementById("tape-kept-note");
let savedTapesOnly = false;
const keptTapes = new Set(readKeptTapes());
let tapeCollectionOpen = false;
let tapeSearch = "";
let rackVisible = 12;
function paintTapeCollection() {
  const collection = document.getElementById("tape-collection");
  const visible = tapeCollectionOpen && document.body.dataset.mood === "music" && document.body.dataset.station !== "radio";
  collection.hidden = !visible;
  document.getElementById("browse-tapes").setAttribute("aria-expanded",String(visible));
  if (!visible) return;
  const grid = document.getElementById("cassette-grid");
  const focusedSrc = document.activeElement?.closest(".cassette-item")?.dataset.tapeSrc;
  const focusedSave = document.activeElement?.classList.contains("cassette-save");
  let restoredFocus = false;
  grid.replaceChildren();
  const matching = TAPES.map((tape,index) => ({tape,index})).filter(({tape}) => (!savedTapesOnly || keptTapes.has(tape.src)) && tape.title.toLocaleLowerCase().includes(tapeSearch));
  const result = matching.length ? `${Math.min(rackVisible,matching.length)} of ${matching.length} recordings` : "No recordings match. Try another title or show all tapes.";
  const resultLabel = document.getElementById("collection-results");
  if (resultLabel.textContent !== result) resultLabel.textContent = result;
  document.getElementById("collection-more").hidden = matching.length <= rackVisible;
  const savedCount = TAPES.filter(tape => keptTapes.has(tape.src)).length;
  document.getElementById("collection-filter").textContent = `saved · ${savedCount}`;
  document.getElementById("collection-filter").disabled = savedCount === 0;
  document.getElementById("collection-filter").setAttribute("aria-pressed",String(savedTapesOnly));
  matching.slice(0,rackVisible).forEach(({tape,index}) => {
    const item = document.createElement("article");
    item.className = "cassette-item";
    item.dataset.tapeSrc = tape.src;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "cassette-card";
    card.dataset.tapeSrc = tape.src;
    card.style.setProperty("--cassette-hue",String([272,193,28,340,150,225][index % 6]));
    const selected = index === tapeIndex;
    card.setAttribute("aria-pressed",String(selected));
    card.classList.toggle("is-spinning",selected && tapeState === "playing");
    const art = document.createElement("span");
    art.className = "cassette-art";
    art.setAttribute("aria-hidden","true");
    const label = document.createElement("span");
    label.className = "cassette-label";
    label.textContent = `LATE NIGHT / ${String(index+1).padStart(2,"0")}`;
    const reels = document.createElement("span");
    reels.className = "cassette-reels";
    reels.append(document.createElement("i"),document.createElement("i"));
    art.append(label,reels);
    const title = document.createElement("strong");
    title.textContent = tape.title;
    const note = document.createElement("small");
    note.textContent = selected ? tapeState === "playing" ? "playing · " + tape.licence : "selected · " + tape.licence : tape.licence;
    card.append(art,title,note);
    card.addEventListener("click",() => { if (index !== tapeIndex) chooseTape(tape.src); });
    const save = document.createElement("button");
    save.type = "button";
    save.className = "cassette-save";
    const kept = keptTapes.has(tape.src);
    save.textContent = kept ? "♥" : "♡";
    save.setAttribute("aria-pressed",String(kept));
    save.setAttribute("aria-label",`${kept ? "Remove" : "Save"} ${tape.title}${kept ? " from saved tapes" : ""}`);
    save.addEventListener("click",() => toggleKeptTape(tape.src));
    item.append(card,save);
    grid.append(item);
    if (focusedSrc === tape.src) { (focusedSave ? save : card).focus({preventScroll:true}); restoredFocus = true; }
  });
  if (focusedSrc && !restoredFocus && visible) document.getElementById("collection-search").focus({preventScroll:true});
}
document.getElementById("collection-search").addEventListener("input",event => {
  tapeSearch = event.target.value.trim().toLocaleLowerCase();
  rackVisible = 12;
  paintTapeCollection();
});
document.getElementById("collection-filter").addEventListener("click",() => {
  savedTapesOnly = !savedTapesOnly;
  rackVisible = 12;
  paintTapeShelf();
});
document.getElementById("collection-more").addEventListener("click",() => {
  const oldCount = document.querySelectorAll(".cassette-card").length;
  rackVisible += 12;
  paintTapeCollection();
  document.querySelectorAll(".cassette-card")[oldCount]?.focus({preventScroll:true});
});
document.getElementById("browse-tapes").addEventListener("click",() => {
  tapeCollectionOpen = !tapeCollectionOpen;
  paintTapeCollection();
  if (tapeCollectionOpen) {
    document.getElementById("tape-collection").scrollIntoView({block:"start",behavior:"instant"});
    document.getElementById("tape-collection").focus({preventScroll:true});
  }
});
document.getElementById("close-collection").addEventListener("click",() => {
  tapeCollectionOpen = false;
  paintTapeCollection();
  document.getElementById("browse-tapes").focus();
});
new MutationObserver(paintTapeCollection).observe(document.body,{attributes:true,attributeFilter:["data-mood","data-station"]});

function readKeptTapes() {
  try {
    const value = JSON.parse(localStorage.getItem("lateNight.keptTapes") || "[]");
    return Array.isArray(value) ? value.filter(src => typeof src === "string") : [];
  } catch { return []; }
}

function rememberedTape() {
  try { return localStorage.getItem("lateNight.tape"); } catch { return null; }
}
function rememberTape() {
  try { localStorage.setItem("lateNight.tape", TAPES[tapeIndex].src); } catch { /* Playback still works. */ }
}
function paintTapeShelf() {
  const count = TAPES.filter(tape => keptTapes.has(tape.src)).length;
  if (!count) savedTapesOnly = false;
  tapeChoice.replaceChildren();
  TAPES.forEach(tape => {
    if (savedTapesOnly && !keptTapes.has(tape.src) && tape.src !== TAPES[tapeIndex].src) return;
    const option = document.createElement("option");
    option.value = tape.src;
    option.textContent = `${keptTapes.has(tape.src) ? "♥ " : ""}${tape.title}`;
    tapeChoice.append(option);
  });
  tapeChoice.value = TAPES[tapeIndex].src;
  const kept = keptTapes.has(TAPES[tapeIndex].src);
  tapeKeep.textContent = kept ? "♥ kept" : "♡ keep";
  tapeKeep.setAttribute("aria-pressed", String(kept));
  tapeKeep.setAttribute("aria-label", kept ? "Remove this tape from saved tapes" : "Save this tape");
  tapeFilter.textContent = `saved tapes · ${count}`;
  tapeFilter.disabled = count === 0;
  tapeFilter.setAttribute("aria-pressed", String(savedTapesOnly));
  paintTapeCollection();
}
function chooseTape(src) {
  const index = TAPES.findIndex(tape => tape.src === src);
  if (index < 0) return;
  ++tapeRequest;
  clearInterval(fadeStep);
  if (tapeAudio) tapeAudio.pause();
  tapeAudio = null;
  tapeState = "idle";
  tapeError = "";
  tapeIndex = index;
  tapeKeptNote.textContent = "";
  rememberTape();
  paintTapeShelf();
  paintTape();
  if (tapeRunning) playTape();
}
tapeChoice.addEventListener("change", () => chooseTape(tapeChoice.value));
function toggleKeptTape(src) {
  if (keptTapes.has(src)) keptTapes.delete(src);
  else keptTapes.add(src);
  try {
    localStorage.setItem("lateNight.keptTapes", JSON.stringify([...keptTapes]));
    tapeKeptNote.textContent = keptTapes.has(src) ? "kept on this device" : "removed from saved tapes";
  } catch {
    tapeKeptNote.textContent = "changes kept for this visit · device storage unavailable";
  }
  document.getElementById("collection-save-note").textContent = tapeKeptNote.textContent;
  paintTapeShelf();
}
tapeKeep.addEventListener("click", () => toggleKeptTape(TAPES[tapeIndex].src));
tapeFilter.addEventListener("click", () => {
  savedTapesOnly = !savedTapesOnly;
  rackVisible = 12;
  paintTapeShelf();
});
paintTapeShelf();

function paintTape() {
  const tape = TAPES[tapeIndex];
  playerTitle.textContent = document.body.dataset.station === "radio" ? `lofi girl · ${currentRadio().name}` : `${tape.title} · ${tape.licence}`;
  player.dataset.playback = tapeState;
  player.classList.toggle("is-playing",tapeState === "playing");
  playerPlay.textContent = tapeState === "loading" ? "loading" : tapeRunning ? "pause" : tapeError ? "retry" : "play";
  document.getElementById("tape-status").textContent = tapeState === "loading" ? "Finding the recording…" : tapeError || (tapeState === "playing" ? "A real recording. Settle in." : "Ready when you are.");
  paintTapeCollection();
  paintTapePosition();
  const sourceLink = document.getElementById("tape-source");
  try {
    const source = new URL(tape.src);
    const item = source.pathname.match(/^\/download\/([^/]+)\//);
    sourceLink.href = source.hostname === "archive.org" && item ? `https://archive.org/details/${item[1]}` : source.href;
    sourceLink.hidden = source.protocol !== "https:";
  } catch { sourceLink.hidden = true; }
}
function tapeTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const whole = Math.floor(seconds);
  return `${String(Math.floor(whole/60)).padStart(2,"0")}:${String(whole%60).padStart(2,"0")}`;
}
function paintTapePosition() {
  const elapsed = Number.isFinite(tapeAudio?.currentTime) ? tapeAudio.currentTime : 0;
  const duration = tapeAudio?.duration;
  const seekable = Number.isFinite(duration) && duration > 0;
  document.getElementById("tape-elapsed").textContent = tapeTime(elapsed);
  document.getElementById("tape-duration").textContent = tapeTime(duration);
  const seek = document.getElementById("tape-seek");
  seek.disabled = !seekable;
  seek.value = seekable ? String(Math.min(1000,elapsed / duration * 1000)) : "0";
  seek.setAttribute("aria-valuetext",seekable ? `${tapeTime(elapsed)} of ${tapeTime(duration)}` : "Duration available when the recording loads");
}
document.getElementById("tape-seek").addEventListener("input",event => {
  if (!tapeAudio || !Number.isFinite(tapeAudio.duration) || tapeAudio.duration <= 0) return;
  tapeAudio.currentTime = Number(event.target.value) / 1000 * tapeAudio.duration;
  paintTapePosition();
});
function failTape(error,track,request) {
  if (track !== tapeAudio || request !== tapeRequest || !tapeRunning) return;
  ++tapeRequest;
  clearInterval(fadeStep);
  fadeStep = null;
  track.pause();
  tapeRunning = false;
  tapeState = "error";
  tapeError = error?.name === "NotAllowedError" ? "Tap retry to start the recording." : "Recording unavailable. Retry, choose another tape or try radio.";
  paintTape();
}

function fadeAudio(target, seconds) {
  clearInterval(fadeStep);
  const track = tapeAudio;
  const from = Math.min(1,track.volume / Math.max(.001,eveningSoundGain));
  const steps = Math.max(1, Math.round(seconds * 25));
  let step = 0;

  fadeStep = setInterval(() => {
    step++;
    track.volume = Math.min(1, Math.max(0, (from + (target - from) * (step / steps)) * eveningSoundGain));
    if (step >= steps) {
      clearInterval(fadeStep);
      fadeStep = null;
      if (target === 0) track.pause();
    }
  }, 40);
}

function loadTape() {
  if (!tapeAudio) {
    tapeAudio = new Audio();
    tapeAudio.preload = "none";
    tapeAudio.volume = 0;

    const track = tapeAudio;
    ["loadedmetadata","durationchange","timeupdate","seeked"].forEach(name => track.addEventListener(name,() => { if (track === tapeAudio) paintTapePosition(); }));

    tapeAudio.addEventListener("ended", () => { if (track === tapeAudio && tapeRunning) nextTape(); });
  }

  tapeAudio.src = TAPES[tapeIndex].src;
}

function playTape() {
  const request = ++tapeRequest;
  if (tapeState === "error") {
    clearInterval(fadeStep);
    tapeAudio?.pause();
    tapeAudio = null;
  }
  if (!tapeAudio || !tapeAudio.src) loadTape();
  const track = tapeAudio;
  tapeState = "loading";
  tapeError = "";
  paintTape();
  track.onerror = () => failTape(track.error,track,request);
  track.play().then(() => {
    if (request !== tapeRequest || track !== tapeAudio || !tapeRunning) return;
    tapeState = "playing";
    paintTape();
  }).catch(error => failTape(error,track,request));
  fadeAudio(tapeVolume, 2.5);
}

function pauseTape() {
  ++tapeRequest;
  tapeState = "paused";
  tapeError = "";
  paintTape();
  if (tapeAudio) fadeAudio(0, 1.2);
}

function nextTape() {
  const shelf = savedTapesOnly ? TAPES.filter(tape => keptTapes.has(tape.src)) : TAPES;
  const current = shelf.findIndex(tape => tape.src === TAPES[tapeIndex].src);
  if (shelf.length) chooseTape(shelf[(current + 1) % shelf.length].src);
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
  radioFrame.hidden = document.body.dataset.mood !== "music" || next !== "radio";
  radioDial.hidden = radioFrame.hidden;
  tapeShelf.hidden = next !== "tape";

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

  if (running) playTape();
  else pauseTape();
}

function setVolume(value, { save = true } = {}) {
  tapeVolume = Math.min(1, Math.max(0, value));
  volumeSlider.value = String(Math.round(tapeVolume * 100));

  if (tapeAudio && !tapeAudio.paused) {
    clearInterval(fadeStep);
    fadeStep = null;
    tapeAudio.volume = tapeVolume * eveningSoundGain;
  }

  if (save) localStorage.setItem("lateNight.volume", String(tapeVolume));
}

volumeSlider.addEventListener("input", () => setVolume(Number(volumeSlider.value) / 100));

playerPlay.addEventListener("click", () => setTape(!tapeRunning));
playerNext.addEventListener("click", nextTape);

buildRadioDial();
setVolume(tapeVolume, { save: false });
setStation("tape");
loadTapeRack();



/* --- what the room sounds like: real recordings, streamed from the archive --- */
const RAIN_ARCHIVE = "https://archive.org/download/relaxingrainsounds/";

const RAIN_BY_STRENGTH = {
  drizzle: { src: RAIN_ARCHIVE + "Light%20Gentle%20Rain%20Part%201.mp3", level: 0.4, name: "light gentle rain" },
  steady: { src: RAIN_ARCHIVE + "Rain%20Trickling%20Sounds%20Part%201.mp3", level: 0.55, name: "rain trickling" },
  downpour: { src: RAIN_ARCHIVE + "Thunderstorm%20Out%20In%20The%20Fields.mp3", level: 0.7, name: "thunderstorm in the fields" },
};

const AMBIENCE = {
  calm: {
    src: "https://archive.org/download/ocean-sea-sounds/Gentle%20Ocean.mp3",
    level: 0.45,
    name: "gentle ocean",
  },
  focus: {
    src: "https://archive.org/download/relaxingsounds/FIRE%202%203h%20Blazing%20Fireplace.mp3",
    level: 0.4,
    name: "a fireplace, three hours of it",
  },
  sleep: {
    src: RAIN_ARCHIVE + "Light%20Gentle%20Rain%20Part%202.mp3",
    level: 0.22,
    name: "rain, far away",
  },
  space: {
    src: "./assets/floating-in-space.wav",
    level: 0.24,
    name: "floating in space",
  },
  aurora: {
    src: "./assets/floating-in-space.wav",
    level: 0.2,
    name: "floating in space",
  },
};

const listenButton = document.getElementById("listen");
const ambienceName = document.getElementById("ambience-name");
const roomSlider = document.getElementById("room-volume");
const AMBIENT_CHOICES = ["auto", "rain", "ocean", "fire", "space"];
let ambientChoice = "auto";
try {
  const saved = localStorage.getItem("lateNight.ambientChoice");
  if (AMBIENT_CHOICES.includes(saved)) ambientChoice = saved;
} catch { /* Follow the mood for this visit. */ }

function setAmbientChoice(value, { save = true, swap = true } = {}) {
  ambientChoice = AMBIENT_CHOICES.includes(value) ? value : "auto";
  document.body.dataset.ambient = ambientChoice;
  document.querySelectorAll("[data-ambient]").forEach(button => {
    if (button.tagName === "BUTTON") button.setAttribute("aria-pressed", String(button.dataset.ambient === ambientChoice));
  });
  document.getElementById("sound-choice-note").textContent = ambientChoice === "auto"
    ? "The recording follows your mood and rain setting."
    : "Your recording stays with you across moods. Weather stays as you set it.";
  if (save) {
    try { localStorage.setItem("lateNight.ambientChoice", ambientChoice); }
    catch { document.getElementById("sound-choice-note").textContent = "Chosen for this visit. Couldn't save on this device."; }
  }
  document.getElementById("rain-dial").hidden = !isRainScene() && ambientChoice !== "rain";
  if (swap) swapAmbience();
}

// one knob for the whole room, on top of each sound's own level
const storedRoom = localStorage.getItem("lateNight.roomVolume");
let roomVolume = storedRoom === null ? 1 : Math.min(1, Math.max(0, Number(storedRoom) || 0));

function levelOf(sound) {
  return sound.level * roomVolume;
}

let ambienceTrack = null;
let ambienceFade = null;
let ambienceRequest = 0;
let ambienceError = "";
let ambienceLoading = false;
let listening = localStorage.getItem("lateNight.listen") === "1";

function ambienceFor(mood) {
  if (ambientChoice === "rain") return RAIN_BY_STRENGTH[rainLevel];
  if (ambientChoice === "ocean") return AMBIENCE.calm;
  if (ambientChoice === "fire") return AMBIENCE.focus;
  if (ambientChoice === "space") return AMBIENCE.space;
  if (isRainScene(mood)) return RAIN_BY_STRENGTH[rainLevel];
  return AMBIENCE[mood] || null;
}

function paintAmbience() {
  const sound = ambienceFor(document.body.dataset.mood);

  document.body.classList.toggle("has-ambience", Boolean(sound));
  document.getElementById("ambience").hidden = !sound;
  document.body.classList.toggle("is-listening", listening);
  listenButton.classList.toggle("is-loading", ambienceLoading);
  listenButton.classList.toggle("is-on", listening);
  listenButton.setAttribute("aria-pressed", String(listening));
  listenButton.textContent = ambienceLoading ? "loading" : listening ? "listening" : ambienceError ? "retry" : "listen";
  ambienceName.textContent = ambienceLoading ? "tuning in…" : ambienceError || (sound ? `${sound.name}${listening ? "" : " · ready when you are"}` : "");
  const sourceLink = document.getElementById("ambient-source");
  sourceLink.hidden = !sound;
  if (sound) {
    const source = new URL(sound.src, document.baseURI);
    const item = source.hostname === "archive.org" && source.pathname.match(/^\/download\/([^/]+)\//);
    sourceLink.href = item ? `https://archive.org/details/${item[1]}` : "https://opengameart.org/content/floating-in-space";
  } else sourceLink.removeAttribute("href");
  document.getElementById("sound-shelf").classList.toggle("is-playing", listening && !ambienceLoading && !ambienceError && Boolean(sound));
}

// Every playback attempt owns its callbacks. Leaving a mood invalidates them.
function fadeAmbience(target, seconds, andThen) {
  clearInterval(ambienceFade);
  const track = ambienceTrack;
  if (!track) return;
  const from = Math.min(1,track.volume / Math.max(.001,eveningSoundGain));
  const steps = Math.max(1, Math.round(seconds * 25));
  let step = 0;
  ambienceFade = setInterval(() => {
    step++;
    track.volume = Math.min(1, Math.max(0, (from + (target - from) * step / steps) * eveningSoundGain));
    if (step >= steps) {
      clearInterval(ambienceFade);
      ambienceFade = null;
      if (andThen) andThen();
    }
  }, 40);
}

function handleAmbienceFailure(error, request) {
  if (request !== ambienceRequest || !listening) return;
  ++ambienceRequest;
  clearInterval(ambienceFade);
  ambienceTrack?.pause();
  ambienceLoading = false;
  listening = false;
  localStorage.setItem("lateNight.listen", "0");
  ambienceError = error?.name === "NotAllowedError"
    ? "tap listen to start" : "recording unavailable · tap retry";
  paintAmbience();
}

function startAmbience() {
  const sound = ambienceFor(document.body.dataset.mood);
  if (!listening || !sound) return;
  const request = ++ambienceRequest;
  clearInterval(ambienceFade);
  const src = new URL(sound.src, document.baseURI).href;
  if (!ambienceTrack || ambienceTrack.src !== src) {
    if (ambienceTrack) {
      ambienceTrack.onerror = null;
      ambienceTrack.pause();
    }
    ambienceTrack = new Audio(src);
    ambienceTrack.loop = true;
    ambienceTrack.preload = "none";
    ambienceTrack.volume = 0;
  }
  const track = ambienceTrack;
  ambienceError = "";
  ambienceLoading = track.paused;
  track.onerror = () => handleAmbienceFailure(track.error, request);
  paintAmbience();
  track.play().then(() => {
    if (request !== ambienceRequest) return;
    ambienceLoading = false;
    fadeAmbience(levelOf(ambienceFor(document.body.dataset.mood)), 1.4);
    paintAmbience();
  }).catch(error => handleAmbienceFailure(error, request));
}

function stopAmbience() {
  ++ambienceRequest;
  ambienceLoading = false;
  ambienceError = "";
  clearInterval(ambienceFade);
  if (ambienceTrack) {
    ambienceTrack.onerror = null;
    // Cancel a pending play immediately; otherwise it could start after leaving.
    if (ambienceTrack.paused || ambienceTrack.readyState < 3) ambienceTrack.pause();
    else {
      const track = ambienceTrack;
      fadeAmbience(0, 0.6, () => track.pause());
    }
  }
  paintAmbience();
}

function swapAmbience() {
  if (listening && ambienceFor(document.body.dataset.mood)) startAmbience();
  else stopAmbience();
}

function setRoomVolume(value, { save = true } = {}) {
  roomVolume = Math.min(1, Math.max(0, value));
  roomSlider.value = String(Math.round(roomVolume * 100));

  const sound = ambienceFor(document.body.dataset.mood);
  if (sound && ambienceTrack && !ambienceTrack.paused) {
    clearInterval(ambienceFade);
    ambienceFade = null;
    ambienceTrack.volume = levelOf(sound) * eveningSoundGain;
  }

  if (save) localStorage.setItem("lateNight.roomVolume", String(roomVolume));
}

roomSlider.addEventListener("input", () => setRoomVolume(Number(roomSlider.value) / 100));

listenButton.addEventListener("click", () => {
  if (listening) {
    listening = false;
    ambienceLoading = false;
    localStorage.setItem("lateNight.listen", "0");
    paintAmbience();
    stopAmbience();
    return;
  }

  ambienceError = "";
  listening = true;
  localStorage.setItem("lateNight.listen", "1");
  paintAmbience();
  startAmbience();
});

const musicRainButton = document.getElementById("music-rain");
function paintMusicRain() {
  musicRainButton.setAttribute("aria-pressed", String(musicRainEnabled));
  musicRainButton.replaceChildren(document.createTextNode(musicRainEnabled ? "rain is here −" : "add real rain ＋"));
}
musicRainButton.addEventListener("click", () => {
  setAmbientChoice("auto", { swap: false });
  musicRainEnabled = !musicRainEnabled;
  localStorage.setItem("lateNight.musicRain", musicRainEnabled ? "1" : "0");
  if (musicRainEnabled) {
    listening = true;
    localStorage.setItem("lateNight.listen", "1");
  }
  paintMusicRain();
  paintWeather();
  swapAmbience();
});
paintMusicRain();

document.querySelectorAll("button[data-ambient]").forEach(button => {
  button.addEventListener("click", () => setAmbientChoice(button.dataset.ambient));
});
setAmbientChoice(ambientChoice, { save: false, swap: false });

setRoomVolume(roomVolume, { save: false });
paintAmbience();
setRainLevel(rainLevel, { save: false });



/* --- the room's window and desk lamp --- */
const windowView = document.getElementById("window-view");
const deskLamp = document.getElementById("desk-lamp");
const lightState = document.getElementById("light-state");
const lightButtons = document.querySelectorAll(".light-tones button");
let lightTone = "amber";
try {
  const saved = localStorage.getItem("lateNight.lightTone");
  if (["amber", "moon", "dim"].includes(saved)) lightTone = saved;
} catch { /* The lamp still works without device storage. */ }

function rememberLight(key, value) {
  try { localStorage.setItem(key, String(value)); } catch { /* Keep this visit's light. */ }
}

/* Cloth sits above the weather, below the readable window controls. */
let curtainAmount = 25;
let curtainFabric = "linen";
const CURTAIN_FABRICS = ["linen", "plum", "ink"];
function validCurtains(value) {
  return Boolean(value && typeof value === "object" && Number.isFinite(value.amount)
    && value.amount >= 0 && value.amount <= 100 && CURTAIN_FABRICS.includes(value.fabric));
}
try {
  const saved = JSON.parse(localStorage.getItem("lateNight.curtains") || "null");
  if (validCurtains(saved)) { curtainAmount = Math.round(saved.amount); curtainFabric = saved.fabric; }
} catch { /* Keep the folds open around this visit. */ }
function setCurtains(value, { fabric = curtainFabric, save = true } = {}) {
  curtainAmount = Number.isFinite(Number(value)) ? Math.min(100, Math.max(0, Math.round(Number(value)))) : 25;
  curtainFabric = CURTAIN_FABRICS.includes(fabric) ? fabric : "linen";
  windowView.style.setProperty("--curtain-width", `${curtainAmount * .3}%`);
  windowView.style.setProperty("--curtain-sign-top", curtainAmount > 55 ? "74%" : "55%");
  windowView.dataset.curtains = String(curtainAmount);
  windowView.dataset.fabric = curtainFabric;
  document.querySelectorAll("button[data-curtain]").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.curtain) === curtainAmount)));
  document.querySelectorAll("button[data-fabric]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.fabric === curtainFabric)));
  document.getElementById("curtain-amount").value = String(curtainAmount);
  document.getElementById("curtain-level").value = `${curtainAmount}%`;
  document.getElementById("curtain-amount").setAttribute("aria-valuetext", `${curtainAmount} percent drawn`);
  document.getElementById("curtain-pull").setAttribute("aria-label", `${curtainAmount === 100 ? "Open" : "Draw"} the curtains${curtainAmount > 0 && curtainAmount < 100 ? " further" : ""}. Currently ${curtainAmount} percent drawn`);
  document.getElementById("curtain-note").textContent = curtainAmount === 0
    ? "The whole window is yours. Touch the pull to draw the curtains."
    : `${curtainFabric} · ${curtainAmount}% drawn. Touch the pull to change the folds.`;
  if (save) {
    try { localStorage.setItem("lateNight.curtains", JSON.stringify({ amount: curtainAmount, fabric: curtainFabric })); }
    catch { document.getElementById("curtain-note").textContent = "Adjusted for this visit. Couldn't save on this device."; }
  }
}
document.querySelectorAll("button[data-curtain]").forEach(button => button.addEventListener("click", () => setCurtains(Number(button.dataset.curtain))));
document.querySelectorAll("button[data-fabric]").forEach(button => button.addEventListener("click", () => setCurtains(curtainAmount, { fabric: button.dataset.fabric })));
document.getElementById("curtain-amount").addEventListener("input", event => setCurtains(Number(event.target.value)));
document.getElementById("curtain-pull").addEventListener("click", () => setCurtains(curtainAmount === 0 ? 25 : curtainAmount < 100 ? 100 : 0));
setCurtains(curtainAmount, { save: false });

const neighbourWindows = [];
const cityMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let cityLightsTimer = null;

// Fixed silhouettes and unevenly lit apartments keep the city familiar.
[["skyline-far", [35, 52, 43, 73, 46, 59, 92, 66, 42, 77, 53, 64, 38, 82, 50, 67]],
 ["skyline-near", [45, 66, 34, 80, 54, 46, 70, 38, 60, 86, 48, 62]]].forEach(([id, heights]) => {
  const row = document.getElementById(id);
  heights.forEach((height, index) => {
    const building = document.createElement("span");
    building.style.setProperty("--height", `${height}%`);
    building.style.setProperty("--width", String(2 + index % 3));
    building.style.setProperty("--lights", index % 3 === 0 ? "#e4ac716b" : "#99c6e637");
    const columns = 2 + index % 3;
    const floors = Math.max(3, Math.round(height / 12));
    const apartments = document.createElement("span");
    apartments.className = "apartment-lights";
    apartments.style.setProperty("--columns", String(columns));
    apartments.style.setProperty("--floors", String(floors));
    for (let flat = 0; flat < columns * floors; flat++) {
      const light = document.createElement("i");
      light.className = "apartment-window";
      // A stable mix of warm, cool and dark windows instead of an office grid.
      const seed = (flat * 17 + index * 23 + height) % 11;
      light.classList.toggle("is-lit", seed < 4);
      if (seed === 1) light.classList.add("is-warm");
      apartments.append(light);
      if (id === "skyline-near") neighbourWindows.push(light);
    }
    building.append(apartments);
    row.append(building);
  });
});

function syncCityLife() {
  clearTimeout(cityLightsTimer);
  document.body.classList.toggle("city-is-hidden", document.hidden);
  cityLightsTimer = null;
  const mood = document.body.dataset.mood;
  const paused = document.hidden || cityMotion.matches || windowScene !== "city" || mood === "space" || mood === "aurora";
  document.body.classList.toggle("city-is-paused", paused);
  if (paused) return;
  cityLightsTimer = setTimeout(() => {
    const candidates = document.body.dataset.mood === "sleep"
      ? neighbourWindows.filter(light => light.classList.contains("is-lit")) : neighbourWindows;
    if (candidates.length) {
      const light = candidates[Math.floor(Math.random() * candidates.length)];
      light.classList.toggle("is-lit");
    }
    syncCityLife();
  }, 6500 + Math.random() * 3500);
}
document.addEventListener("visibilitychange", syncCityLife);
cityMotion.addEventListener("change", () => { syncCityLife(); syncWindowSky(); });

function setWindowScene(scene, { save = true } = {}) {
  windowScene = ["mountains", "coast", "cafe"].includes(scene) ? scene : "city";
  document.body.dataset.view = windowScene;
  document.querySelectorAll("[data-cafe-only]").forEach(element => { element.hidden = windowScene !== "cafe"; });
  document.querySelectorAll(".view-switch button").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.view === windowScene));
  });
  windowView.setAttribute("aria-label", { cafe: "Your late-night café window", coast: "Your coastal window", mountains: "Your mountain window", city: "Your night city window" }[windowScene]);
  document.getElementById("window-whisper").textContent = { cafe: "there is still a light on.", coast: "let the tide take its time.", mountains: "let the world wait.", city: "let the city carry on." }[windowScene];
  paintSceneCaption();
  syncCityLife();
  syncWindowSky();
  if (save) {
    try { localStorage.setItem("lateNight.view", windowScene); } catch { /* The current view still works. */ }
  }
}
document.querySelectorAll(".view-switch button").forEach(button => {
  button.addEventListener("click", () => setWindowScene(button.dataset.view));
});

function setDeskLamp(on) {
  windowView.classList.toggle("lamp-off", !on);
  deskLamp.setAttribute("aria-pressed", String(on));
  lightState.textContent = `${lightTone} · ${on ? "on" : "off"}`;
}
setDeskLamp(localStorage.getItem("lateNight.deskLamp") !== "0");
deskLamp.addEventListener("click", () => {
  const on = deskLamp.getAttribute("aria-pressed") !== "true";
  setDeskLamp(on);
  rememberLight("lateNight.deskLamp", on ? "1" : "0");
});

function setLightTone(tone, { save = true, turnOn = true } = {}) {
  lightTone = ["amber", "moon", "dim"].includes(tone) ? tone : "amber";
  windowView.dataset.light = lightTone;
  lightButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.light === lightTone)));
  setDeskLamp(turnOn || deskLamp.getAttribute("aria-pressed") === "true");
  if (save) {
    rememberLight("lateNight.lightTone", lightTone);
    if (turnOn) rememberLight("lateNight.deskLamp", "1");
  }
}
lightButtons.forEach(button => button.addEventListener("click", () => setLightTone(button.dataset.light)));
setLightTone(lightTone, { save: false, turnOn: false });

const lightSlider = document.getElementById("light-brightness");
const lightLevel = document.getElementById("light-level");
let lightStrength = 70;
try {
  const saved = localStorage.getItem("lateNight.lightStrength");
  if (saved !== null && Number.isFinite(Number(saved))) lightStrength = Math.min(100, Math.max(10, Number(saved)));
} catch { /* Use the gentle default. */ }
function setLightStrength(value, { save = true, turnOn = true } = {}) {
  lightStrength = Number.isFinite(value) ? Math.min(100, Math.max(10, value)) : 70;
  windowView.style.setProperty("--lamp-strength", String(lightStrength / 100));
  lightSlider.value = String(lightStrength);
  lightLevel.value = `${lightStrength}%`;
  lightSlider.setAttribute("aria-valuetext", `${lightStrength} percent`);
  if (turnOn) setDeskLamp(true);
  if (save) {
    rememberLight("lateNight.lightStrength", lightStrength);
    if (turnOn) rememberLight("lateNight.deskLamp", "1");
  }
}
lightSlider.addEventListener("input", () => setLightStrength(Number(lightSlider.value)));
setLightStrength(lightStrength, { save: false, turnOn: false });

/* One deliberate gesture starts both layers; nothing autoplays on first visit. */
const eveningToggle = document.getElementById("evening-toggle");
function eveningIsPlaying() {
  return document.body.dataset.mood === "music" && station === "tape"
    && tapeRunning && Boolean(ambienceFor("music")) && listening;
}
function paintEveningToggle() {
  const playing = eveningIsPlaying();
  eveningToggle.hidden = document.body.dataset.mood === "music" && station === "radio";
  const background = { ocean: "ocean", fire: "fireplace", space: "space" }[ambientChoice] || "rain";
  eveningToggle.textContent = playing ? "Ⅱ pause the evening" : `▶ lo-fi + ${background}`;
  eveningToggle.setAttribute("aria-pressed", String(playing));
  eveningToggle.setAttribute("aria-label", playing ? "Pause the tape and background together" : `Play a lo-fi tape and ${background} together`);
}
eveningToggle.addEventListener("click", () => {
  if (eveningIsPlaying()) {
    setTape(false);
    listening = false;
    localStorage.setItem("lateNight.listen", "0");
    stopAmbience();
  } else {
    if (ambientChoice === "auto") musicRainEnabled = true;
    listening = true;
    localStorage.setItem("lateNight.musicRain", musicRainEnabled ? "1" : "0");
    localStorage.setItem("lateNight.listen", "1");
    paintMusicRain();
    setStation("tape");
    setMood("music");
    if (!tapeRunning) setTape(true);
  }
  paintEveningToggle();
});
// Also follow individual controls, recording failures and keyboard mood changes.
const eveningObserver = new MutationObserver(paintEveningToggle);
eveningObserver.observe(document.body, { attributes: true, attributeFilter: ["data-mood", "data-station", "data-ambient"] });
eveningObserver.observe(player, { attributes: true, attributeFilter: ["class"] });
eveningObserver.observe(listenButton, { attributes: true, attributeFilter: ["aria-pressed"] });
eveningObserver.observe(musicRainButton, { attributes: true, attributeFilter: ["aria-pressed"] });
paintEveningToggle();

/* --- a drink by the window --- */
const cupButton = document.getElementById("window-cup");
const cupRitual = document.getElementById("cup-ritual");
const cupNote = document.getElementById("cup-note");
const cupCaption = document.getElementById("cup-caption");
const drinkChoices = document.querySelectorAll(".drink-choices button");
let drink = "tea";
let cupPouredAt = Date.now();
let cupHeatTimer = null;
try { if (localStorage.getItem("lateNight.drink") === "coffee") drink = "coffee"; } catch { /* Tea is fine. */ }

function setDrink(value, { save = true } = {}) {
  drink = value === "coffee" ? "coffee" : "tea";
  cupButton.dataset.drink = drink;
  drinkChoices.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.drink === drink)));
  if (save) cupPouredAt = Date.now();
  paintCupHeat();
  if (save) {
    try { localStorage.setItem("lateNight.drink", drink); } catch { /* Keep the drink for this visit. */ }
  }
}
function closeCupRitual() {
  cupRitual.hidden = true;
  cupButton.setAttribute("aria-expanded", "false");
  cupButton.focus({ preventScroll: true });
}
cupButton.addEventListener("click", () => {
  if (!cupRitual.hidden) { closeCupRitual(); return; }
  cupRitual.hidden = false;
  cupButton.setAttribute("aria-expanded", "true");
  document.querySelector(`.drink-choices [data-drink="${drink}"]`).focus({ preventScroll: true });
});
document.getElementById("cup-close").addEventListener("click", closeCupRitual);
drinkChoices.forEach(button => button.addEventListener("click", () => setDrink(button.dataset.drink)));
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !cupRitual.hidden) { event.preventDefault(); closeCupRitual(); }
});
setDrink(drink, { save: false });

function paintCupHeat() {
  clearTimeout(cupHeatTimer);
  cupHeatTimer = null;
  const elapsed = Math.max(0, Date.now() - cupPouredAt);
  const heat = elapsed < 120000 ? "fresh" : elapsed < 300000 ? "warm" : "cool";
  cupButton.dataset.heat = heat;
  cupCaption.textContent = `${drink} · ${heat === "fresh" ? "hot" : heat}`;
  cupButton.setAttribute("aria-label", `${drink === "tea" ? "Tea" : "Coffee"}, ${heat === "fresh" ? "hot" : heat}. Open drink controls`);
  cupNote.textContent = heat === "fresh" ? "Freshly poured. Stay a little."
    : heat === "warm" ? "Still warm. Take your time." : "Getting cool. A little more warmth?";
  if (!document.hidden && heat !== "cool") {
    const next = heat === "fresh" ? 120000 : 300000;
    cupHeatTimer = setTimeout(paintCupHeat, Math.max(1, cupPouredAt + next - Date.now()));
  }
}
document.getElementById("cup-warm").addEventListener("click", () => {
  cupPouredAt = Date.now();
  paintCupHeat();
  cupButton.classList.remove("just-poured");
  void cupButton.offsetWidth;
  cupButton.classList.add("just-poured");
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { clearTimeout(cupHeatTimer); cupHeatTimer = null; }
  else paintCupHeat();
});

/* --- choose the colour of the night outside --- */
const SKY_PALETTES = ["mood", "midnight", "violet", "afterglow"];
let outsideSky = "mood";
try { const saved = localStorage.getItem("lateNight.sky"); if (SKY_PALETTES.includes(saved)) outsideSky = saved; } catch { /* Follow the room. */ }
function setOutsideSky(value, { save = true } = {}) {
  outsideSky = SKY_PALETTES.includes(value) ? value : "mood";
  windowView.dataset.sky = outsideSky;
  document.getElementById("sky-label").textContent = outsideSky === "mood" ? "follow mood" : outsideSky;
  document.querySelectorAll(".sky-choices button").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.sky === outsideSky)));
  if (save) rememberLight("lateNight.sky", outsideSky);
}
document.querySelectorAll(".sky-choices button").forEach(button => button.addEventListener("click", () => setOutsideSky(button.dataset.sky)));
setOutsideSky(outsideSky, { save: false });

const MOON_SHAPES = ["full", "half", "crescent"];
let moonShape = "full";
try { const saved = localStorage.getItem("lateNight.moon"); if (MOON_SHAPES.includes(saved)) moonShape = saved; } catch { /* A full moon tonight. */ }
function setMoonShape(value, { save = true } = {}) {
  moonShape = MOON_SHAPES.includes(value) ? value : "full";
  windowView.dataset.moon = moonShape;
  document.querySelectorAll(".moon-choices button").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.moon === moonShape)));
  if (save) rememberLight("lateNight.moon", moonShape);
}
document.querySelectorAll(".moon-choices button").forEach(button => button.addEventListener("click", () => setMoonShape(button.dataset.moon)));
setMoonShape(moonShape, { save: false });

const beaconButton = document.getElementById("beacon-button");
let lighthouseOn = true;
try { lighthouseOn = localStorage.getItem("lateNight.beacon") !== "0"; } catch { /* Keep the harbour light. */ }
function setLighthouse(on, { save = true } = {}) {
  lighthouseOn = Boolean(on);
  windowView.dataset.beacon = lighthouseOn ? "on" : "off";
  beaconButton.setAttribute("aria-pressed", String(lighthouseOn));
  beaconButton.textContent = `lighthouse beam · ${lighthouseOn ? "on" : "off"}`;
  if (save) rememberLight("lateNight.beacon", lighthouseOn ? "1" : "0");
}
beaconButton.addEventListener("click", () => setLighthouse(!lighthouseOn));
setLighthouse(lighthouseOn, { save: false });

const meteorButton = document.getElementById("meteor-button");
const meteorNote = document.getElementById("meteor-note");
function paintMeteorControls() {
  beaconButton.hidden = windowScene !== "coast";
  meteorButton.disabled = document.hidden || cityMotion.matches || !hasStarSky();
  meteorNote.textContent = cityMotion.matches ? "Motion is reduced on this device."
    : hasStarSky() ? "An occasional visitor in the clear sky." : "For clear Mountains, Coast or Space.";
}
meteorButton.addEventListener("click", () => {
  if (launchComet()) {
    windowView.scrollIntoView({ behavior: "instant", block: "center" });
    windowView.focus({ preventScroll: true });
    meteorNote.textContent = "Something quiet crosses the night.";
  } else meteorNote.textContent = "Let this one finish its journey.";
});
const skyObserver = new MutationObserver(paintMeteorControls);
skyObserver.observe(document.body, { attributes: true, attributeFilter: ["data-mood", "data-view", "class"] });
cityMotion.addEventListener("change", paintMeteorControls);
document.addEventListener("visibilitychange", paintMeteorControls);
paintMeteorControls();

/* A companion on the sill: a touch, a slow blink, then back to sleep. */
const catButton = document.getElementById("window-cat");
const catStatus = document.getElementById("cat-status");
let catPetUntil = 0;
let catPetTimer = null;
function settleCat() {
  clearTimeout(catPetTimer);
  catPetTimer = null;
  const awake = catPetUntil > Date.now();
  catButton.dataset.state = awake ? "content" : "asleep";
  catButton.setAttribute("aria-label", awake ? "Pet the contented cat" : "Pet the sleeping cat");
  if (awake && !document.hidden) catPetTimer = setTimeout(settleCat, catPetUntil - Date.now());
  if (!awake) catStatus.textContent = "";
}
catButton.addEventListener("click", () => {
  catPetUntil = Date.now() + 4500;
  catStatus.textContent = "A slow blink. Nowhere else to be.";
  settleCat();
});
document.addEventListener("visibilitychange", settleCat);
settleCat();

const CAT_COATS = ["ginger", "ink", "moon"];
let catCoat = "ginger";
let catPresent = true;
try {
  const savedCat = JSON.parse(localStorage.getItem("lateNight.cat"));
  if (savedCat && CAT_COATS.includes(savedCat.coat) && typeof savedCat.present === "boolean") {
    catCoat = savedCat.coat;
    catPresent = savedCat.present;
  }
} catch {}
function setCatCompanion(coat, present, { save = true } = {}) {
  if (!CAT_COATS.includes(coat) || typeof present !== "boolean") return;
  catCoat = coat;
  catPresent = present;
  catButton.dataset.coat = coat;
  catButton.hidden = !present;
  windowView.dataset.catCoat = coat;
  windowView.dataset.catPresent = String(present);
  if (!present) { catPetUntil = 0; settleCat(); }
  document.querySelectorAll("button[data-cat-coat]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.catCoat === coat)));
  document.getElementById("cat-label").textContent = present ? `${coat} · here` : "a little solitude";
  document.getElementById("cat-toggle").setAttribute("aria-pressed", String(present));
  document.getElementById("cat-toggle").textContent = `cat at the window · ${present ? "on" : "off"}`;
  document.getElementById("cat-settings-note").textContent = present ? "Touch the cat for a slow blink." : "The warm spot will be here later.";
  if (save) {
    try { localStorage.setItem("lateNight.cat", JSON.stringify({ coat, present })); }
    catch { document.getElementById("cat-settings-note").textContent = "Kept for this visit. Device storage unavailable."; }
  }
}
document.querySelectorAll("button[data-cat-coat]").forEach(button => button.addEventListener("click", () => setCatCompanion(button.dataset.catCoat, catPresent)));
document.getElementById("cat-toggle").addEventListener("click", () => setCatCompanion(catCoat, !catPresent));
setCatCompanion(catCoat, catPresent, { save: false });

/* The café can close for the night, without changing anything in our room. */
let cafeOpen = true;
try { cafeOpen = localStorage.getItem("lateNight.cafeLight") !== "0"; } catch {}
function setCafeLight(on, { save = true } = {}) {
  cafeOpen = Boolean(on);
  windowView.dataset.cafeOpen = String(cafeOpen);
  document.getElementById("cafe-sign").textContent = cafeOpen ? "OPEN LATE" : "GOOD NIGHT";
  document.getElementById("cafe-sign").setAttribute("aria-pressed", String(cafeOpen));
  document.getElementById("cafe-light-button").setAttribute("aria-pressed", String(cafeOpen));
  document.getElementById("cafe-light-button").textContent = `café lights · ${cafeOpen ? "on" : "off"}`;
  if (save) { try { localStorage.setItem("lateNight.cafeLight", cafeOpen ? "1" : "0"); } catch {} }
}
document.getElementById("cafe-sign").addEventListener("click", () => setCafeLight(!cafeOpen));
document.getElementById("cafe-light-button").addEventListener("click", () => setCafeLight(!cafeOpen));
setCafeLight(cafeOpen, { save: false });

/* --- a whole evening, chosen with one deliberate gesture --- */
const EVENING_SCENES = {
  cafe: { name: "The last café", mood: "music", view: "cafe", rainOn: true, rain: "drizzle", light: "amber", strength: 45, lamp: true, ambience: true, drink: "coffee", sky: "midnight", moon: "half", cafe: true, curtains: { amount: 25, fabric: "plum" } },
  harbour: { name: "Harbour after hours", mood: "calm", view: "coast", rainOn: false, rain: "drizzle", light: "amber", strength: 45, lamp: true, ambience: true, drink: "tea", sky: "midnight", moon: "full", beacon: true, curtains: { amount: 0, fabric: "linen" } },
  records: { name: "Rainy records", mood: "music", view: "city", rainOn: true, rain: "steady", light: "amber", strength: 70, lamp: true, ambience: true, drink: "tea", sky: "mood", moon: "full", curtains: { amount: 25, fabric: "linen" } },
  hideaway: { name: "Mountain hideaway", mood: "music", view: "mountains", rainOn: false, rain: "drizzle", light: "moon", strength: 45, lamp: true, ambience: false, drink: "coffee", sky: "midnight", moon: "crescent", curtains: { amount: 25, fabric: "ink" } },
  lastlight: { name: "The last light", mood: "sleep", view: "mountains", rainOn: false, rain: "drizzle", light: "dim", strength: 20, lamp: true, ambience: true, drink: "tea", curtains: { amount: 100, fabric: "ink" } },
};
const sceneStatus = document.getElementById("scene-status");
const personalCard = document.querySelector('[data-evening="personal"]');
const forgetEvening = document.getElementById("forget-evening");
let personalScene = readPersonalScene();

function readPersonalScene() {
  try {
    const value = JSON.parse(localStorage.getItem("lateNight.personalScene") || "null");
    if (!value || typeof value !== "object" || Array.isArray(value)
        || !["calm", "music", "focus", "rain", "space", "sleep", "aurora"].includes(value.mood)
        || !["city", "mountains", "coast", "cafe"].includes(value.view) || !["amber", "moon", "dim"].includes(value.light)
        || !RAIN_ORDER.includes(value.rain) || !Number.isFinite(value.strength)
        || value.strength < 10 || value.strength > 100
        || ["rainOn", "lamp", "ambience", "playTape"].some(key => typeof value[key] !== "boolean")) return null;
    return { name: "Your evening", mood: value.mood, view: value.view, light: value.light,
      rain: value.rain, strength: value.strength, rainOn: value.rainOn, lamp: value.lamp,
      sky: SKY_PALETTES.includes(value.sky) ? value.sky : null, moon: MOON_SHAPES.includes(value.moon) ? value.moon : null, beacon: typeof value.beacon === "boolean" ? value.beacon : null,
      cat: value.cat && CAT_COATS.includes(value.cat.coat) && typeof value.cat.present === "boolean" ? { coat: value.cat.coat, present: value.cat.present } : null,
      cafe: typeof value.cafe === "boolean" ? value.cafe : null,
      curtains: validCurtains(value.curtains) ? { amount: Math.round(value.curtains.amount), fabric: value.curtains.fabric } : null,
      ambientChoice: AMBIENT_CHOICES.includes(value.ambientChoice) ? value.ambientChoice : "auto",
      ambience: value.ambience, playTape: value.playTape, drink: ["tea", "coffee"].includes(value.drink) ? value.drink : null,
      station: value.station === "radio" ? "radio" : "tape",
      radio: RADIOS.some(radio => radio.key === value.radio) ? value.radio : RADIOS[0].key };
  } catch { return null; }
}
function paintPersonalScene() {
  personalCard.hidden = !personalScene;
  forgetEvening.hidden = !personalScene;
  document.querySelector(".scene-cards").classList.toggle("has-personal", Boolean(personalScene));
  if (!personalScene) return;
  const savedSound = { rain: "rain", ocean: "ocean", fire: "fireplace", space: "space" }[personalScene.ambientChoice];
  document.getElementById("personal-recipe").textContent = `${personalScene.view} · ${personalScene.mood} · ${personalScene.light} light${savedSound ? ` · ${savedSound} sound` : ""}${personalScene.drink ? ` · ${personalScene.drink}` : ""}${personalScene.cat ? personalScene.cat.present ? ` · ${personalScene.cat.coat} cat` : " · solitude" : ""}`;
  personalCard.dataset.personalView = personalScene.view;
  personalCard.dataset.personalSky = personalScene.sky || "mood";
}
document.getElementById("keep-evening").addEventListener("click", () => {
  const snapshot = { name: "Your evening", mood: document.body.dataset.mood, view: windowScene,
    rainOn: musicRainEnabled, rain: rainLevel, light: lightTone, strength: lightStrength,
    lamp: deskLamp.getAttribute("aria-pressed") === "true", ambience: listening,
    playTape: tapeRunning, station, radio: radioKey, drink, sky: outsideSky, moon: moonShape, beacon: lighthouseOn, cat: { coat: catCoat, present: catPresent }, cafe: cafeOpen, ambientChoice, curtains: { amount: curtainAmount, fabric: curtainFabric } };
  try { localStorage.setItem("lateNight.personalScene", JSON.stringify(snapshot)); }
  catch { sceneStatus.textContent = "Couldn't keep this evening on this device."; return; }
  personalScene = snapshot;
  paintPersonalScene();
  paintSceneCards();
  sceneStatus.textContent = "Your evening is kept on this device. Keep again to replace it.";
});
forgetEvening.addEventListener("click", () => {
  try { localStorage.removeItem("lateNight.personalScene"); }
  catch { sceneStatus.textContent = "Couldn't remove the saved setup on this device."; return; }
  personalScene = null;
  paintPersonalScene();
  document.getElementById("keep-evening").focus();
  sceneStatus.textContent = "Saved setup forgotten. The room is still yours to adjust.";
});
paintPersonalScene();

function storeEveningSetting(key, value) {
  try { localStorage.setItem(key, String(value)); } catch { /* Apply the scene for this visit. */ }
}
function applyEveningScene(scene) {
  // Finish changing the room before starting its new recording.
  if (tapeRunning) setTape(false);
  listening = false;
  stopAmbience();
  setAmbientChoice(scene.ambientChoice || "auto", { swap: false });
  setStation("tape");
  musicRainEnabled = scene.rainOn;
  storeEveningSetting("lateNight.musicRain", musicRainEnabled ? "1" : "0");
  paintMusicRain();
  setRainLevel(scene.rain);
  setWindowScene(scene.view);
  setLightTone(scene.light);
  setLightStrength(scene.strength);
  setDeskLamp(scene.lamp);
  if (scene.drink) setDrink(scene.drink);
  if (scene.sky) setOutsideSky(scene.sky);
  if (scene.moon) setMoonShape(scene.moon);
  if (typeof scene.beacon === "boolean") setLighthouse(scene.beacon);
  if (scene.cat) setCatCompanion(scene.cat.coat, scene.cat.present);
  if (typeof scene.cafe === "boolean") setCafeLight(scene.cafe);
  if (scene.curtains) setCurtains(scene.curtains.amount, { fabric: scene.curtains.fabric });
  storeEveningSetting("lateNight.deskLamp", scene.lamp ? "1" : "0");
  setMood(scene.mood);
  if (scene.mood === "music" && scene.station === "radio") {
    radioKey = scene.radio;
    storeEveningSetting("lateNight.radio", radioKey);
    setStation("radio");
  }
  listening = scene.ambience;
  storeEveningSetting("lateNight.listen", listening ? "1" : "0");
  swapAmbience();
  if (scene.mood === "music" && station === "tape" && scene.playTape !== false) setTape(true);
  sceneStatus.textContent = `${scene.name} · make yourself at home.`;
  paintSceneCards();
}
function paintSceneCards() {
  document.querySelectorAll(".scene-card").forEach(button => {
    const scene = button.dataset.evening === "personal" ? personalScene : EVENING_SCENES[button.dataset.evening];
    if (!scene) { button.setAttribute("aria-pressed", "false"); return; }
    const matches = document.body.dataset.mood === scene.mood && windowScene === scene.view
      && musicRainEnabled === scene.rainOn && rainLevel === scene.rain && lightTone === scene.light
      && lightStrength === scene.strength && (deskLamp.getAttribute("aria-pressed") === "true") === scene.lamp
      && (scene.mood !== "music" || station === (scene.station || "tape")) && (!scene.drink || scene.drink === drink)
      && (!scene.sky || scene.sky === outsideSky) && (!scene.moon || scene.moon === moonShape)
      && (typeof scene.beacon !== "boolean" || scene.beacon === lighthouseOn)
      && (!scene.cat || scene.cat.coat === catCoat && scene.cat.present === catPresent)
      && ambientChoice === (scene.ambientChoice || "auto")
      && (!scene.curtains || scene.curtains.amount === curtainAmount && scene.curtains.fabric === curtainFabric);
    const cafeMatches = typeof scene.cafe !== "boolean" || scene.cafe === cafeOpen;
    button.setAttribute("aria-pressed", String(matches && cafeMatches));
  });
}
document.querySelectorAll(".scene-card").forEach(button => button.addEventListener("click", () => {
  const scene = button.dataset.evening === "personal" ? personalScene : EVENING_SCENES[button.dataset.evening];
  if (scene) applyEveningScene(scene);
}));
const sceneObserver = new MutationObserver(paintSceneCards);
sceneObserver.observe(document.body, { attributes: true, attributeFilter: ["data-mood", "data-view", "data-rain", "data-station", "data-ambient"] });
sceneObserver.observe(windowView, { attributes: true, attributeFilter: ["data-light", "style", "data-sky", "data-moon", "data-beacon", "data-cat-coat", "data-cat-present", "data-cafe-open", "data-curtains", "data-fabric"] });
sceneObserver.observe(deskLamp, { attributes: true, attributeFilter: ["aria-pressed"] });
sceneObserver.observe(musicRainButton, { attributes: true, attributeFilter: ["aria-pressed"] });
sceneObserver.observe(cupButton, { attributes: true, attributeFilter: ["data-drink"] });

/* --- something left in the room for whoever pokes around --- */
const SECRET_WORD = "moon";

let typed = "";

if (localStorage.getItem("lateNight.aurora") === "1") {
  document.body.classList.add("knows-aurora");
}

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) return;
  if (e.key.length !== 1) return;

  typed = (typed + e.key.toLowerCase()).slice(-SECRET_WORD.length);
  if (typed !== SECRET_WORD) return;

  typed = "";
  document.body.classList.add("knows-aurora");
  localStorage.setItem("lateNight.aurora", "1");
  setMood("aurora");
});

/* A deadline for the sound, independent of moods, views and the focus clock. */
let soundTimerMinutes = 30;
let soundTimerEndsAt = null;
let soundTimerTick = null;
let soundTimerFinished = false;
let soundTimerLamp = false;
try {
  const saved = JSON.parse(localStorage.getItem("lateNight.soundTimer"));
  if (saved && [15,30,60].includes(saved.minutes) && typeof saved.lamp === "boolean"
      && typeof saved.finished === "boolean" && (saved.endsAt === null || Number.isFinite(saved.endsAt)
        && saved.endsAt > 0 && saved.endsAt <= Date.now() + saved.minutes * 60000)
      && !(saved.finished && saved.endsAt !== null)) {
    soundTimerMinutes = saved.minutes;
    soundTimerLamp = saved.lamp;
    soundTimerFinished = saved.finished;
    soundTimerEndsAt = saved.endsAt;
  }
} catch {}
function saveSoundTimer() {
  try { localStorage.setItem("lateNight.soundTimer",JSON.stringify({minutes:soundTimerMinutes,lamp:soundTimerLamp,endsAt:soundTimerEndsAt,finished:soundTimerFinished})); }
  catch { document.getElementById("sound-timer-note").textContent = "Timer works for this visit. Device storage unavailable."; }
}
function applyEveningGain(gain) {
  eveningSoundGain = Math.max(0,Math.min(1,gain));
  if (tapeAudio && tapeRunning && !tapeAudio.paused && !fadeStep) tapeAudio.volume = tapeVolume * eveningSoundGain;
  const sound = ambienceFor(document.body.dataset.mood);
  if (ambienceTrack && listening && !ambienceTrack.paused && !ambienceFade && sound) ambienceTrack.volume = levelOf(sound) * eveningSoundGain;
}
function paintSoundTimer() {
  const left = soundTimerEndsAt === null ? soundTimerFinished ? 0 : soundTimerMinutes * 60000 : Math.max(0,soundTimerEndsAt - Date.now());
  if (soundTimerEndsAt !== null) applyEveningGain(Math.min(1,left / 60000));
  if (soundTimerEndsAt !== null && left <= 0) { finishSoundTimer(); return; }
  const seconds = Math.ceil(left / 1000);
  document.getElementById("sound-timer-time").textContent = `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
  const hasTimer = soundTimerEndsAt !== null || soundTimerFinished;
  document.body.classList.toggle("has-sound-timer",hasTimer);
  const windowTimer = document.getElementById("window-sound-timer");
  windowTimer.hidden = !hasTimer;
  windowTimer.style.setProperty("--sound-left",String(left / (soundTimerMinutes * 60000)));
  document.getElementById("window-sound-time").textContent = soundTimerFinished ? "finished" : document.getElementById("sound-timer-time").textContent;
  document.getElementById("window-sound-action").textContent = soundTimerFinished ? "dismiss · ×" : "until quiet · ×";
  windowTimer.setAttribute("aria-label",soundTimerFinished ? "Dismiss completed sound timer" : `Cancel sound timer, ${Math.ceil(left / 60000)} minutes until quiet`);
  document.getElementById("sound-timer-lamp").disabled = soundTimerEndsAt !== null;
  document.getElementById("sound-timer-lamp").checked = soundTimerLamp;
  document.getElementById("sound-timer").dataset.state = soundTimerEndsAt !== null ? "running" : soundTimerFinished ? "done" : "idle";
  document.getElementById("sound-timer-start").hidden = soundTimerEndsAt !== null;
  document.getElementById("sound-timer-cancel").hidden = soundTimerEndsAt === null;
  document.querySelectorAll("button[data-sound-minutes]").forEach(button => {
    button.disabled = soundTimerEndsAt !== null;
    button.setAttribute("aria-pressed",String(Number(button.dataset.soundMinutes) === soundTimerMinutes));
  });
}
function stopEveningSound() {
  setTape(false);
  clearInterval(fadeStep);
  fadeStep = null;
  tapeAudio?.pause();
  listening = false;
  try { localStorage.setItem("lateNight.listen","0"); } catch {}
  stopAmbience();
  clearInterval(ambienceFade);
  ambienceFade = null;
  ambienceTrack?.pause();
  closeRadio();
}
function finishSoundTimer() {
  clearInterval(soundTimerTick);
  soundTimerTick = null;
  soundTimerEndsAt = null;
  soundTimerFinished = true;
  stopEveningSound();
  if (soundTimerLamp) {
    setDeskLamp(false);
    try { localStorage.setItem("lateNight.deskLamp","0"); } catch {}
  }
  applyEveningGain(1);
  document.getElementById("sound-timer-note").textContent = "Quiet now. Nothing else will start.";
  saveSoundTimer();
  paintSoundTimer();
}
function startSoundTimer() {
  clearInterval(soundTimerTick);
  soundTimerFinished = false;
  soundTimerEndsAt = Date.now() + soundTimerMinutes * 60000;
  soundTimerTick = setInterval(paintSoundTimer,250);
  document.getElementById("sound-timer-note").textContent = "Tapes and ambience fade in the final minute. Radio stops at the end.";
  saveSoundTimer();
  paintSoundTimer();
}
function cancelSoundTimer() {
  clearInterval(soundTimerTick);
  soundTimerTick = null;
  soundTimerEndsAt = null;
  soundTimerFinished = false;
  applyEveningGain(1);
  document.getElementById("sound-timer-note").textContent = "Timer cancelled. Your evening continues.";
  saveSoundTimer();
  paintSoundTimer();
}
document.querySelectorAll("button[data-sound-minutes]").forEach(button => button.addEventListener("click", () => {
  if (soundTimerEndsAt !== null) return;
  soundTimerMinutes = Number(button.dataset.soundMinutes);
  soundTimerFinished = false;
  saveSoundTimer();
  paintSoundTimer();
}));
document.getElementById("sound-timer-start").addEventListener("click",() => {
  startSoundTimer();
  document.getElementById("sound-timer-cancel").focus({preventScroll:true});
});
document.getElementById("sound-timer-cancel").addEventListener("click",() => {
  cancelSoundTimer();
  document.getElementById("sound-timer-start").focus({preventScroll:true});
});
document.getElementById("sound-timer-lamp").addEventListener("change",event => {
  if (soundTimerEndsAt === null) { soundTimerLamp = event.target.checked; saveSoundTimer(); }
});
document.getElementById("window-sound-timer").addEventListener("click",() => {
  cancelSoundTimer();
  document.getElementById("quiet-room").focus({preventScroll:true});
});
document.addEventListener("visibilitychange", () => { if (!document.hidden) paintSoundTimer(); });
if (soundTimerEndsAt !== null && soundTimerEndsAt > Date.now()) {
  soundTimerTick = setInterval(paintSoundTimer,250);
  document.getElementById("sound-timer-note").textContent = "Your original end time is kept.";
}
// Catch up before the remembered mood can start its ambience.
paintSoundTimer();

setWindowScene(windowScene, { save: false });
setMood(localStorage.getItem("lateNight.mood") || "music", { save: false });
restoreFocusSession();
