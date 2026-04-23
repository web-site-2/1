/* Cinematic Love Story SPA — script.js */

// Editable settings
const SETTINGS = {
  password: "143", // change this
  countdownTargetISO: "2026-12-31T20:30:00", // change this (local time)
  loaderMs: 2000,
  typing: {
    charDelayMs: 22,
    lineDelayMs: 520,
  },
};

const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Micro audio (click + ambient) using WebAudio (no external assets) ---
const AudioEngine = (() => {
  let ctx = null;
  let master = null;
  let ambientGain = null;
  let ambient = null;
  let enabled = false;
  let started = false;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.0; // start muted per requirement
    master.connect(ctx.destination);

    ambientGain = ctx.createGain();
    ambientGain.gain.value = 0.0;
    ambientGain.connect(master);
  }

  function startAmbient() {
    if (started) return;
    ensure();
    if (!ctx) return;
    started = true;

    // Soft "pad": two detuned sines + gentle lowpass noise
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = "sine";
    o2.type = "sine";
    o1.frequency.value = 196; // G3
    o2.frequency.value = 196.8;

    const pad = ctx.createGain();
    pad.gain.value = 0.12;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 800;
    lp.Q.value = 0.6;

    // subtle LFO for movement
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 22;
    lfo.connect(lfoGain);
    lfoGain.connect(o1.frequency);

    o1.connect(pad);
    o2.connect(pad);
    pad.connect(lp);
    lp.connect(ambientGain);

    o1.start();
    o2.start();
    lfo.start();

    ambient = { o1, o2, lfo };
  }

  function setEnabled(on) {
    ensure();
    startAmbient();
    enabled = !!on;
    if (!ctx || !master || !ambientGain) return;
    const target = enabled ? 1.0 : 0.0;
    const amb = enabled ? 0.8 : 0.0;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(target, now, 0.06);
    ambientGain.gain.cancelScheduledValues(now);
    ambientGain.gain.setTargetAtTime(amb, now, 0.12);
  }

  function click() {
    ensure();
    if (!ctx || !master) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 520;
    o.type = "triangle";
    o.frequency.setValueAtTime(650, now);
    o.frequency.exponentialRampToValueAtTime(260, now + 0.06);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.12, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    o.connect(f);
    f.connect(g);
    g.connect(master);
    o.start(now);
    o.stop(now + 0.09);
  }

  function unlockFromGesture() {
    ensure();
    startAmbient();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  }

  return { setEnabled, click, unlockFromGesture, get enabled() { return enabled; } };
})();

// --- Ambient particles (bokeh) canvas ---
function initAmbientCanvas() {
  const canvas = qs("#ambientCanvas");
  if (!canvas) return () => {};
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return () => {};

  const DPR = Math.min(2, window.devicePixelRatio || 1);
  let w = 0;
  let h = 0;
  let running = true;

  const count = prefersReducedMotion() ? 18 : 42;
  const pts = Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.006 + Math.random() * 0.018,
    v: 0.0015 + Math.random() * 0.004,
    hue: Math.random() < 0.5 ? 330 : 265, // pink/purple
    a: 0.04 + Math.random() * 0.10,
  }));

  function resize() {
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, Math.floor(rect.width));
    h = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(w * DPR);
    canvas.height = Math.floor(h * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function draw() {
    if (!running) return;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    for (const p of pts) {
      p.y += p.v;
      if (p.y > 1.15) {
        p.y = -0.15;
        p.x = Math.random();
      }
      const x = p.x * w;
      const y = p.y * h;
      const r = p.r * Math.min(w, h);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `hsla(${p.hue}, 90%, 65%, ${p.a})`);
      g.addColorStop(1, `hsla(${p.hue}, 90%, 65%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    requestAnimationFrame(draw);
  }

  resize();
  draw();
  window.addEventListener("resize", resize, { passive: true });
  return () => {
    running = false;
    window.removeEventListener("resize", resize);
  };
}

// --- Cursor glow ---
function initCursorGlow() {
  const el = qs("#cursorGlow");
  if (!el || prefersReducedMotion()) return () => {};
  let raf = 0;
  let tx = window.innerWidth * 0.5;
  let ty = window.innerHeight * 0.35;
  let cx = tx;
  let cy = ty;

  function tick() {
    // ease follow
    cx += (tx - cx) * 0.12;
    cy += (ty - cy) * 0.12;
    el.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
    raf = requestAnimationFrame(tick);
  }

  function onMove(e) {
    tx = e.clientX;
    ty = e.clientY;
  }

  function onLeave() {
    el.style.opacity = "0.0";
  }
  function onEnter() {
    el.style.opacity = "0.9";
  }

  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("blur", onLeave);
  window.addEventListener("focus", onEnter);
  raf = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("blur", onLeave);
    window.removeEventListener("focus", onEnter);
  };
}

// --- Typewriter (line by line) ---
async function typeLines(targetEl, lines) {
  const reduced = prefersReducedMotion();
  const charDelay = reduced ? 0 : SETTINGS.typing.charDelayMs;
  const lineDelay = reduced ? 0 : SETTINGS.typing.lineDelayMs;

  targetEl.innerHTML = "";

  for (const line of lines) {
    const p = document.createElement("p");
    p.className = "type__line";
    targetEl.appendChild(p);

    const span = document.createElement("span");
    p.appendChild(span);

    const cursor = document.createElement("span");
    cursor.className = "type__cursor";
    p.appendChild(cursor);

    for (let i = 0; i < line.length; i++) {
      span.textContent += line[i];
      if (charDelay) await sleep(charDelay);
    }

    cursor.remove();
    if (lineDelay) await sleep(lineDelay);
  }
}

// --- Reveal on scroll + Parallax ---
function initScrollFx() {
  const revealEls = qsa(".reveal");
  const reduced = prefersReducedMotion();

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) e.target.classList.add("reveal--in");
      }
    },
    { threshold: 0.14 }
  );
  for (const el of revealEls) io.observe(el);

  if (reduced) return () => io.disconnect();

  const parallaxEls = qsa("[data-parallax]");
  let raf = 0;

  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const vh = window.innerHeight || 1;
      for (const el of parallaxEls) {
        const k = Number(el.getAttribute("data-parallax") || "0");
        const r = el.getBoundingClientRect();
        const t = (r.top + r.height * 0.5 - vh * 0.5) / vh; // -1..1
        const y = clamp(t, -1.2, 1.2) * -32 * k;
        el.style.transform = `translate3d(0, ${y}px, 0)`;
      }
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  return () => {
    io.disconnect();
    window.removeEventListener("scroll", onScroll);
    if (raf) cancelAnimationFrame(raf);
  };
}

// --- Special moment particles (soft hearts + glow) ---
function initMoment() {
  const btn = qs("#momentBtn");
  const reset = qs("#momentReset");
  const reveal = qs("#momentReveal");
  const canvas = qs("#momentCanvas");
  if (!btn || !reset || !reveal || !canvas) return () => {};

  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const DPR = Math.min(2, window.devicePixelRatio || 1);
  let w = 0;
  let h = 0;
  let running = false;
  let raf = 0;
  let particles = [];

  function resize() {
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, Math.floor(rect.width));
    h = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(w * DPR);
    canvas.height = Math.floor(h * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function heartPath(x, y, s) {
    ctx.beginPath();
    // Minimal, elegant heart curve (not cartoony)
    ctx.moveTo(x, y + s * 0.28);
    ctx.bezierCurveTo(x, y, x - s * 0.55, y, x - s * 0.55, y + s * 0.33);
    ctx.bezierCurveTo(
      x - s * 0.55,
      y + s * 0.64,
      x - s * 0.18,
      y + s * 0.84,
      x,
      y + s
    );
    ctx.bezierCurveTo(
      x + s * 0.18,
      y + s * 0.84,
      x + s * 0.55,
      y + s * 0.64,
      x + s * 0.55,
      y + s * 0.33
    );
    ctx.bezierCurveTo(x + s * 0.55, y, x, y, x, y + s * 0.28);
    ctx.closePath();
  }

  function burst() {
    if (prefersReducedMotion()) {
      reveal.classList.add("moment__reveal--on");
      reset.disabled = false;
      return;
    }

    resize();
    canvas.classList.add("moment__canvas--on");
    reveal.classList.add("moment__reveal--on");
    reset.disabled = false;

    const cx = w * 0.5;
    const cy = h * 0.52;
    const n = 80;
    particles = Array.from({ length: n }, () => {
      const ang = Math.random() * Math.PI * 2;
      const sp = 0.6 + Math.random() * 2.2;
      const hue = Math.random() < 0.6 ? 330 : 275;
      return {
        x: cx + (Math.random() - 0.5) * 12,
        y: cy + (Math.random() - 0.5) * 12,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 1.1,
        rot: (Math.random() - 0.5) * 0.7,
        vr: (Math.random() - 0.5) * 0.12,
        s: 8 + Math.random() * 14,
        hue,
        a: 0.12 + Math.random() * 0.16,
        life: 70 + Math.floor(Math.random() * 50),
      };
    });

    if (!running) {
      running = true;
      raf = requestAnimationFrame(tick);
    }
  }

  function tick() {
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    const g = ctx.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.55, Math.min(w, h) * 0.35);
    g.addColorStop(0, "rgba(255,107,154,0.10)");
    g.addColorStop(0.5, "rgba(179,136,235,0.06)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    particles = particles.filter((p) => p.life > 0);
    for (const p of particles) {
      p.life -= 1;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.03; // gravity
      p.rot += p.vr;
      p.a *= 0.985;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);

      const fill = `hsla(${p.hue}, 92%, 68%, ${clamp(p.a, 0, 0.22)})`;
      ctx.fillStyle = fill;
      ctx.shadowColor = `hsla(${p.hue}, 92%, 70%, 0.25)`;
      ctx.shadowBlur = 18;
      heartPath(0, -p.s * 0.5, p.s);
      ctx.fill();
      ctx.restore();
    }

    ctx.globalCompositeOperation = "source-over";

    if (particles.length === 0) {
      running = false;
      canvas.classList.remove("moment__canvas--on");
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function resetMoment() {
    reveal.classList.remove("moment__reveal--on");
    reset.disabled = true;
    particles = [];
    running = false;
    canvas.classList.remove("moment__canvas--on");
    ctx.clearRect(0, 0, w, h);
  }

  btn.addEventListener("click", () => {
    AudioEngine.unlockFromGesture();
    AudioEngine.click();
    burst();
  });
  reset.addEventListener("click", () => {
    AudioEngine.unlockFromGesture();
    AudioEngine.click();
    resetMoment();
  });

  window.addEventListener("resize", resize, { passive: true });
  resize();

  return () => {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
  };
}

// --- Countdown ---
function initCountdown() {
  const target = new Date(SETTINGS.countdownTargetISO);
  const els = {
    days: qs('[data-unit="days"]'),
    hours: qs('[data-unit="hours"]'),
    minutes: qs('[data-unit="minutes"]'),
    seconds: qs('[data-unit="seconds"]'),
  };
  if (!els.days || !els.hours || !els.minutes || !els.seconds) return () => {};

  let last = { days: "", hours: "", minutes: "", seconds: "" };

  function setUnit(unit, value) {
    const el = els[unit];
    if (!el) return;
    const s = String(value).padStart(2, "0");
    if (s !== last[unit]) {
      el.textContent = s;
      el.classList.remove("tick");
      // force reflow to restart animation
      void el.offsetWidth; // eslint-disable-line no-unused-expressions
      el.classList.add("tick");
      last[unit] = s;
    }
  }

  function update() {
    const now = new Date();
    let ms = target - now;
    if (Number.isNaN(ms)) ms = 0;
    ms = Math.max(0, ms);

    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    setUnit("days", days);
    setUnit("hours", hours);
    setUnit("minutes", minutes);
    setUnit("seconds", seconds);
  }

  update();
  const id = setInterval(update, 1000);
  return () => clearInterval(id);
}

// --- Password gate + cinematic transitions ---
function initGate() {
  const loader = qs("#loader");
  const gate = qs("#gate");
  const app = qs("#app");
  const form = qs("#gateForm");
  const input = qs("#secretCode");
  const err = qs("#gateError");
  const soundA = qs("#soundToggle");
  const soundB = qs("#soundToggleBottom");
  const continueBtn = qs("#continueBtn");
  const typeArea = qs("#typeArea");

  function setSoundButtons(on) {
    const label = on ? "Sound: On" : "Sound: Off";
    for (const b of [soundA, soundB]) {
      if (!b) continue;
      b.textContent = label;
      b.setAttribute("aria-pressed", String(!!on));
    }
  }

  function toggleSound() {
    AudioEngine.unlockFromGesture();
    AudioEngine.click();
    AudioEngine.setEnabled(!AudioEngine.enabled);
    setSoundButtons(AudioEngine.enabled);
  }

  soundA?.addEventListener("click", toggleSound);
  soundB?.addEventListener("click", toggleSound);

  // Loader cinematic intro
  (async () => {
    await sleep(SETTINGS.loaderMs);
    loader?.classList.add("loader--hide");
    await sleep(950);
    if (loader) loader.style.display = "none";
    input?.focus?.();
  })();

  const lines = [
    "This is not just a website…",
    "It’s something I made for you.",
    "A place where the world gets quiet.",
    "And it’s only ours.",
  ];

  function unlock() {
    AudioEngine.unlockFromGesture();
    AudioEngine.click();
    err.textContent = " ";
    gate.classList.add("gate--hide");
    gate.setAttribute("aria-hidden", "true");
    app.setAttribute("aria-hidden", "false");

    setTimeout(() => {
      gate.style.display = "none";
    }, 900);

    // Start reveal typing after transition
    (async () => {
      await sleep(420);
      await typeLines(typeArea, lines);
      continueBtn.classList.remove("btn--hidden");
      continueBtn.classList.add("btn--shown");
    })();
  }

  function deny() {
    AudioEngine.unlockFromGesture();
    AudioEngine.click();
    err.textContent = "Wrong code. Try again…";
    gate.classList.remove("shake");
    void gate.offsetWidth; // restart animation
    gate.classList.add("shake");
    input?.select?.();
  }

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    AudioEngine.unlockFromGesture();
    const val = (input?.value || "").trim();
    if (!val) return deny();
    if (val === SETTINGS.password) return unlock();
    return deny();
  });

  // Smooth anchor click sound
  document.addEventListener(
    "click",
    (e) => {
      const t = e.target;
      const btn = t?.closest?.("button, a");
      if (!btn) return;
      AudioEngine.unlockFromGesture();
      AudioEngine.click();
    },
    { passive: true }
  );

  // Start muted ambient; keep UI in sync
  setSoundButtons(false);
}

// --- Boot ---
document.addEventListener("DOMContentLoaded", () => {
  initAmbientCanvas();
  initCursorGlow();
  initScrollFx();
  initMoment();
  initCountdown();
  initGate();
});

