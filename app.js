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

  if (save) localStorage.setItem("lateNight.mood", mood);
}

moodButtons.forEach((btn) => {
  btn.addEventListener("click", () => setMood(btn.dataset.mood));
});

setMood(localStorage.getItem("lateNight.mood") || "calm", { save: false });
