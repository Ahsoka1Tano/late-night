/* Late Night — a tiny digital room for quiet evenings. */

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

function isRainScene(mood = document.body.dataset.mood) {
  return mood === "rain" || (mood === "music" && musicRainEnabled);
}

function paintWeather() {
  document.body.classList.toggle("has-rain", isRainScene());
  if (isRainScene()) startRain();
  else stopRain();
}

function setMood(mood, { save = true } = {}) {
  if (!MOODS[mood]) mood = "calm";
  document.body.dataset.mood = mood;

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

  if (mood === "space" || mood === "aurora") startStars();
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
  if (mood === "space" || mood === "aurora") startStars();
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
  if (document.body.classList.contains("is-window-view")) return;

  const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "");
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

function focusLength() {
  return focusMinutes * 60 * 1000;
}

const focusBlock = document.getElementById("focus");
const focusTime = document.getElementById("focus-time");
const focusProgress = document.getElementById("focus-progress");
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
  const progress = Math.min(1, Math.max(0, 1 - left / focusLength()));
  focusProgress.style.setProperty("--progress", progress);
  focusProgress.setAttribute("aria-valuenow", String(Math.round(progress * 100)));

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
  if (isRainScene(mood)) return RAIN_BY_STRENGTH[rainLevel];
  return AMBIENCE[mood] || null;
}

function paintAmbience() {
  const sound = ambienceFor(document.body.dataset.mood);

  document.body.classList.toggle("has-ambience", Boolean(sound));
  document.body.classList.toggle("is-listening", listening);
  listenButton.classList.toggle("is-loading", ambienceLoading);
  listenButton.classList.toggle("is-on", listening);
  listenButton.setAttribute("aria-pressed", String(listening));
  listenButton.textContent = ambienceLoading ? "loading" : listening ? "listening" : ambienceError ? "retry" : "listen";
  ambienceName.textContent = ambienceLoading ? "tuning in…" : listening && sound ? sound.name : ambienceError;
}

// Every playback attempt owns its callbacks. Leaving a mood invalidates them.
function fadeAmbience(target, seconds, andThen) {
  clearInterval(ambienceFade);
  const track = ambienceTrack;
  if (!track) return;
  const from = track.volume;
  const steps = Math.max(1, Math.round(seconds * 25));
  let step = 0;
  ambienceFade = setInterval(() => {
    step++;
    track.volume = Math.min(1, Math.max(0, from + (target - from) * step / steps));
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
    ambienceTrack.volume = levelOf(sound);
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

setRoomVolume(roomVolume, { save: false });
paintAmbience();
setRainLevel(rainLevel, { save: false });



/* --- the window seat: another view of the same room, with the same audio --- */
const windowView = document.getElementById("window-view");
const windowOpen = document.getElementById("window-open");
const windowClose = document.getElementById("window-close");
const windowPlay = document.getElementById("window-play");
const windowRain = document.getElementById("window-rain");
const windowListen = document.getElementById("window-listen");
const windowTrack = document.getElementById("window-track");
const deskLamp = document.getElementById("desk-lamp");
let windowScroll = 0;
let windowInert = [];
const canvasHomes = [rainCanvas, starsCanvas].map(node => ({ node, parent: node.parentNode, next: node.nextSibling }));

// Fixed silhouettes keep the view familiar each time you come back.
[["skyline-far", [35, 52, 43, 73, 46, 59, 92, 66, 42, 77, 53, 64, 38, 82, 50, 67]],
 ["skyline-near", [45, 66, 34, 80, 54, 46, 70, 38, 60, 86, 48, 62]]].forEach(([id, heights]) => {
  const row = document.getElementById(id);
  heights.forEach((height, index) => {
    const building = document.createElement("span");
    building.style.setProperty("--height", `${height}%`);
    building.style.setProperty("--width", String(2 + index % 3));
    building.style.setProperty("--lights", index % 3 === 0 ? "#e4ac716b" : "#99c6e637");
    row.append(building);
  });
});

function paintWindowControls() {
  const music = document.body.dataset.mood === "music";
  windowPlay.hidden = !music || station !== "tape";
  windowPlay.textContent = tapeRunning ? "pause tape" : "play tape";
  windowRain.hidden = !music;
  windowRain.textContent = musicRainEnabled ? "rain on" : "add rain";
  windowRain.setAttribute("aria-pressed", String(musicRainEnabled));
  windowListen.hidden = !ambienceFor(document.body.dataset.mood);
  windowListen.textContent = ambienceLoading ? "loading…" : listening ? "mute ambience" : ambienceError ? "retry ambience" : "listen";
  windowListen.setAttribute("aria-pressed", String(listening));
  windowTrack.textContent = ambienceError || (music ? playerTitle.textContent : listening ? ambienceName.textContent : "the city is keeping you company");
}

function enterWindow() {
  if (!windowView.hidden) return;
  windowScroll = window.scrollY;
  windowInert = [...document.querySelector(".room").children].map(node => ({ node, inert: node.inert }));
  windowInert.forEach(({ node }) => {
    // Keep the official radio visible and interactive, in its original DOM node.
    if (node !== radioFrame) node.inert = true;
  });
  canvasHomes.forEach(({ node }) => document.getElementById("window-outside").append(node));
  windowView.hidden = false;
  document.body.classList.add("is-window-view");
  paintWindowControls();
  windowClose.focus({ preventScroll: true });
}

function leaveWindow() {
  if (windowView.hidden) return;
  windowView.hidden = true;
  document.body.classList.remove("is-window-view");
  canvasHomes.forEach(({ node, parent, next }) => parent.insertBefore(node, next));
  windowInert.forEach(({ node, inert }) => { node.inert = inert; });
  window.scrollTo({ top: windowScroll, behavior: "instant" });
  windowOpen.focus({ preventScroll: true });
}

windowOpen.addEventListener("click", enterWindow);
windowClose.addEventListener("click", leaveWindow);
windowPlay.addEventListener("click", () => { setTape(!tapeRunning); paintWindowControls(); });
windowRain.addEventListener("click", () => { musicRainButton.click(); paintWindowControls(); });
windowListen.addEventListener("click", () => { listenButton.click(); paintWindowControls(); });
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !windowView.hidden) {
    event.preventDefault();
    leaveWindow();
  }
});

const windowObserver = new MutationObserver(() => {
  if (!windowView.hidden) paintWindowControls();
});
[playerTitle, playerPlay, ambienceName, listenButton].forEach(node => windowObserver.observe(node, { childList: true }));

function setDeskLamp(on) {
  windowView.classList.toggle("lamp-off", !on);
  deskLamp.setAttribute("aria-pressed", String(on));
}
setDeskLamp(localStorage.getItem("lateNight.deskLamp") !== "0");
deskLamp.addEventListener("click", () => {
  const on = deskLamp.getAttribute("aria-pressed") !== "true";
  setDeskLamp(on);
  localStorage.setItem("lateNight.deskLamp", on ? "1" : "0");
});

/* --- something left in the room for whoever pokes around --- */
const SECRET_WORD = "moon";

let typed = "";

if (localStorage.getItem("lateNight.aurora") === "1") {
  document.body.classList.add("knows-aurora");
}

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (!windowView.hidden) return;
  if (/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "")) return;
  if (e.key.length !== 1) return;

  typed = (typed + e.key.toLowerCase()).slice(-SECRET_WORD.length);
  if (typed !== SECRET_WORD) return;

  typed = "";
  document.body.classList.add("knows-aurora");
  localStorage.setItem("lateNight.aurora", "1");
  setMood("aurora");
});

setMood(localStorage.getItem("lateNight.mood") || "calm", { save: false });
