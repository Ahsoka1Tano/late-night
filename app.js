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

  rainFrame = requestAnimationFrame(drawRain);
}

function startRain() {
  if (!calmEnough || rainFrame !== null) return;
  sizeRain();
  if (!drops.length) seedDrops();
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

setMood(localStorage.getItem("lateNight.mood") || "calm", { save: false });
