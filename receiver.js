/* Long exposure light trails on the glass. The coordinates are in CSS pixels. */
(() => {
  const canvas = document.getElementById("sky-ribbons");
  const context = canvas.getContext("2d");
  if (!context) return;
  const glass = canvas.parentElement;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const colours = {
    calm: ["#478a9f", "#abc6ac", "#7e94ad"],
    music: ["#584e93", "#ef8a70", "#f6c295"],
    focus: ["#664a75", "#e79568", "#e2bb89"],
    rain: ["#344a81", "#83b3bd", "#9a92c4"],
    space: ["#443384", "#9267d6", "#729ced"],
    sleep: ["#313c69", "#676891", "#a092ac"],
    aurora: ["#326584", "#63d5b8", "#c3b8f0"]
  };
  let width = 0, height = 0, phase = 0, last = 0, frame = 0;
  let pointer = 0, drift = 0, visible = false;

  function draw() {
    context.clearRect(0, 0, width, height);
    const palette = colours[document.body.dataset.mood] || colours.music;
    const gradient = context.createLinearGradient(0, height * .4, width, height * .1);
    gradient.addColorStop(0, palette[0]);
    gradient.addColorStop(.54, palette[1]);
    gradient.addColorStop(.82, palette[2]);
    gradient.addColorStop(1, palette[0]);
    context.strokeStyle = gradient;
    // Each strand follows the same curve with a changing offset, like folded silk.
    for (let strand = 0; strand < 46; strand++) {
      const fold = strand / 45;
      context.beginPath();
      context.globalAlpha = .13 + .35 * Math.sin(Math.PI * fold);
      context.lineWidth = strand % 6 === 0 ? 1.6 : .8;
      for (let step = 0; step <= 80; step++) {
        const x = step / 80;
        const crest = Math.sin(x * 6.1 - phase * .29 + fold * 1.6 + drift);
        const ripple = Math.sin(x * 9.8 + phase * .21 - fold * 2.3);
        const y = height * (.37 + crest * .15 + ripple * .055 + fold * .19 - x * .19);
        if (!step) context.moveTo(0, y);
        else context.lineTo(x * width, y);
      }
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  function animate(now) {
    if (!last || now - last >= 42) {
      phase += last ? Math.min(now - last, 100) / 1000 : 0;
      last = now;
      drift += (pointer - drift) * .07;
      draw();
    }
    frame = requestAnimationFrame(animate);
  }
  function sync() {
    cancelAnimationFrame(frame);
    last = 0;
    if (!visible || document.hidden || !width || !height) return;
    draw();
    if (!motion.matches) frame = requestAnimationFrame(animate);
  }
  new ResizeObserver(([entry]) => {
    ({width, height} = entry.contentRect);
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    sync();
  }).observe(canvas);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }).observe(canvas);
  new MutationObserver(sync).observe(document.body, {attributes:true, attributeFilter:["data-mood"]});
  motion.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  glass.addEventListener("pointermove", event => {
    if (motion.matches || event.pointerType !== "mouse") return;
    pointer = ((event.clientX - glass.getBoundingClientRect().left) / width - .5) * .8;
  });
  glass.addEventListener("pointerleave", () => { pointer = 0; });
})();
