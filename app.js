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
    btn.classList.toggle("is-active", btn.dataset.mood === mood);
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
  const count = Math.round(window.innerWidth / 9);
  drops = Array.from({ length: count }, () => spawnDrop(true));

  const clinging = Math.round(window.innerWidth / 34);
  glassDrops = Array.from({ length: clinging }, () => spawnGlassDrop(true));
}

function spawnDrop(scattered = false) {
  // depth: 0 = far and faint, 1 = close and quick
  const depth = Math.random();
  return {
    x: Math.random() * window.innerWidth,
    y: scattered ? Math.random() * window.innerHeight : -40,
    length: 8 + depth * 22,
    speed: 3 + depth * 9,
    width: 0.5 + depth * 0.9,
    alpha: 0.08 + depth * 0.22,
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

setMood(localStorage.getItem("lateNight.mood") || "calm", { save: false });
