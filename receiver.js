/* Long exposure light trails on the glass. The coordinates are in CSS pixels. */
(() => {
  const canvas = document.getElementById("sky-ribbons");
  const context = canvas.getContext("2d");
  if (!context) return;
  const glass = canvas.parentElement;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  // The same interpolated CSS values drive both the still and moving sky.
  const style = getComputedStyle(canvas);
  let width = 0, height = 0, phase = 0, last = 0, frame = 0;
  let pointer = 0, drift = 0, visible = false;

  function draw() {
    context.clearRect(0, 0, width, height);
    const edge = style.getPropertyValue("--ribbon-edge");
    const level = Number(style.getPropertyValue("--ribbon-level"));
    const swell = Number(style.getPropertyValue("--ribbon-swell"));
    const spread = Number(style.getPropertyValue("--ribbon-spread"));
    const gradient = context.createLinearGradient(0, height * .4, width, height * .1);
    gradient.addColorStop(0, edge);
    gradient.addColorStop(.54, style.getPropertyValue("--ribbon-core"));
    gradient.addColorStop(.82, style.getPropertyValue("--ribbon-light"));
    gradient.addColorStop(1, edge);
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
        const y = height * (level + swell * (crest + ripple * .36) + spread * (fold - x));
        if (!step) context.moveTo(0, y);
        else context.lineTo(x * width, y);
      }
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  function animate(now) {
    if (!last || now - last >= 42) {
      const elapsed = last ? Math.min(now - last, 100) / 1000 : 0;
      phase += elapsed * Number(style.getPropertyValue("--ribbon-pace"));
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
  // Moving skies sample the palette on each frame. Still skies also need a
  // fresh frame when rain is switched on without leaving the Music mood.
  new MutationObserver(() => {
    if (motion.matches && visible && !document.hidden) draw();
  }).observe(document.body, { attributes: true, attributeFilter: ["data-mood", "class"] });
  motion.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  glass.addEventListener("pointermove", event => {
    if (motion.matches || event.pointerType !== "mouse") return;
    pointer = ((event.clientX - glass.getBoundingClientRect().left) / width - .5) * .8;
  });
  glass.addEventListener("pointerleave", () => { pointer = 0; });
})();
