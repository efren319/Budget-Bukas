// ============================================
// Dust Particles — Delta-time & GC-free particle system
// Floating golden dust motes pushed gently by cursor wind
// ============================================

(function () {
  'use strict';

  // Skip on touch devices or narrow viewports
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;
  if (window.matchMedia('(max-width: 900px)').matches) return;

  const isConstrainedDevice =
    (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  Object.assign(canvas.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: '10',
    transition: 'opacity 0.3s ease'
  });

  document.body.appendChild(canvas);

  let isPerfMode = Boolean(window.PondoSyncPerf && window.PondoSyncPerf.isEnabled());
  let isAdaptiveLow = document.documentElement.classList.contains('adaptive-low-gpu');
  let isTabVisible = !document.hidden;
  let animId = null;

  if (isPerfMode || isAdaptiveLow) {
    canvas.style.opacity = '0';
  }

  let W = 0;
  let H = 0;
  let maxDim = 1;

  // Precompute light pool coordinates on resize instead of per particle per frame
  const LIGHTS = [
    { rx: 0.12, ry: 0.35, radius: 0.32, x: 0, y: 0, rPx: 1 },
    { rx: 0.88, ry: 0.35, radius: 0.32, x: 0, y: 0, rPx: 1 }
  ];

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    maxDim = Math.max(W, H, 1);
    // 1x buffer is indistinguishable for sub-pixel motes and saves 4x GPU fill on HiDPI screens
    canvas.width = W;
    canvas.height = H;
    for (let i = 0; i < LIGHTS.length; i++) {
      LIGHTS[i].x = LIGHTS[i].rx * W;
      LIGHTS[i].y = LIGHTS[i].ry * H;
      LIGHTS[i].rPx = LIGHTS[i].radius * maxDim;
    }
  }

  window.addEventListener('resize', resize, { passive: true });
  resize();

  const mouse = { x: -9999, y: -9999, vx: 0, vy: 0 };
  let lastMX = -9999;
  let lastMY = -9999;

  window.addEventListener('mousemove', (e) => {
    if (isPerfMode || isAdaptiveLow) return;
    mouse.vx = e.clientX - lastMX;
    mouse.vy = e.clientY - lastMY;
    lastMX = mouse.x = e.clientX;
    lastMY = mouse.y = e.clientY;
  }, { passive: true });

  // Precompute LUT of rgba() strings to avoid ~200 heap allocations per frame
  const INTENSITY_STEPS = 12;
  const ALPHA_STEPS = 14;
  const MOTE_COLORS = [];
  const GLINT_COLORS = [];
  for (let ii = 0; ii <= INTENSITY_STEPS; ii++) {
    const intensity = ii / INTENSITY_STEPS;
    const r = Math.round(160 + intensity * 95);
    const g = Math.round(150 + intensity * 70);
    const b = Math.round(130 + intensity * 20);
    const row = new Array(ALPHA_STEPS + 1);
    const glintRow = new Array(ALPHA_STEPS + 1);
    for (let ai = 0; ai <= ALPHA_STEPS; ai++) {
      const a = Math.min(1, ai / ALPHA_STEPS).toFixed(2);
      const ga = Math.min(1, (ai / ALPHA_STEPS) * 0.8).toFixed(2);
      row[ai] = `rgba(${r},${g},${b},${a})`;
      glintRow[ai] = `rgba(255,255,255,${ga})`;
    }
    MOTE_COLORS.push(row);
    GLINT_COLORS.push(glintRow);
  }

  function lightAt(px, py) {
    let best = 0;
    for (let i = 0; i < LIGHTS.length; i++) {
      const L = LIGHTS[i];
      const dx = px - L.x;
      const dy = py - L.y;
      const distSq = dx * dx + dy * dy;
      const rSq = L.rPx * L.rPx;
      if (distSq < rSq) {
        const val = 1 - Math.sqrt(distSq) / L.rPx;
        if (val > best) best = val;
      }
    }
    return best;
  }

  const WIND_RADIUS = 180;
  const WIND_RADIUS_SQ = WIND_RADIUS * WIND_RADIUS;
  const WIND_FORCE = 0.045;
  const DRIFT_FORCE = 0.012;
  const TWO_PI = Math.PI * 2;

  class Dust {
    constructor() {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.vx = (Math.random() - 0.5) * 0.2;
      this.vy = (Math.random() - 0.5) * 0.2;
      this.r = Math.random() * 0.9 + 0.4;
      this.life = Math.random() * 0.6 + 0.4;
      this.shimmer = Math.random() * TWO_PI;
      this.shimmerSpeed = Math.random() * 0.04 + 0.01;
      this.emission = 0;
      this.emissionTarget = 0;
    }

    update(frameScale) {
      this.vx += (Math.random() - 0.5) * DRIFT_FORCE * frameScale;
      this.vy += (Math.random() - 0.5) * DRIFT_FORCE * frameScale;

      const dx = this.x - mouse.x;
      const dy = this.y - mouse.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < WIND_RADIUS_SQ && distSq > 0.01) {
        const dist = Math.sqrt(distSq);
        const strength = (1 - dist / WIND_RADIUS) * WIND_FORCE * frameScale;
        this.vx += (dx / dist) * strength * 3.5 + mouse.vx * strength * 0.3;
        this.vy += (dy / dist) * strength * 3.5 + mouse.vy * strength * 0.3;
      }

      const damping = Math.pow(0.98, frameScale);
      this.vx *= damping;
      this.vy *= damping;

      this.x += this.vx * frameScale;
      this.y += this.vy * frameScale;

      if (this.x < -10) this.x = W + 10;
      else if (this.x > W + 10) this.x = -10;
      if (this.y < -10) this.y = H + 10;
      else if (this.y > H + 10) this.y = -10;

      this.shimmer += this.shimmerSpeed * frameScale;

      if (Math.random() < 0.001 * frameScale) {
        this.emissionTarget = Math.random() * 0.8 + 0.2;
      }
      this.emission += (this.emissionTarget - this.emission) * Math.min(1, 0.1 * frameScale);
      if (this.emission > this.emissionTarget * 0.95) this.emissionTarget = 0;
    }

    draw() {
      const litRaw = lightAt(this.x, this.y);
      const lit = litRaw * litRaw;
      const sparkle = Math.sin(this.shimmer) * 0.5 + 0.5;
      const alpha = this.life * (0.05 + lit * 0.7 + this.emission * 0.6) * (0.5 + sparkle * 0.5);

      if (alpha < 0.05) return;

      const intensity = lit > this.emission ? lit : this.emission;
      const ii = Math.min(INTENSITY_STEPS, Math.round(intensity * INTENSITY_STEPS));
      const ai = Math.min(ALPHA_STEPS, Math.max(1, Math.round(alpha * ALPHA_STEPS)));

      const drawRadius = this.r * (1 + intensity * 0.4);
      ctx.fillStyle = MOTE_COLORS[ii][ai];
      ctx.beginPath();
      ctx.arc(this.x, this.y, drawRadius, 0, TWO_PI);
      ctx.fill();

      if (intensity > 0.7) {
        ctx.fillStyle = GLINT_COLORS[ii][ai];
        ctx.beginPath();
        ctx.arc(this.x, this.y, drawRadius * 0.5, 0, TWO_PI);
        ctx.fill();
      }
    }
  }

  const COUNT = isConstrainedDevice ? 55 : 100;
  const motes = Array.from({ length: COUNT }, () => new Dust());

  const TARGET_INTERVAL = 1000 / 36; // Smooth 36fps background ambiance
  let lastFrameAt = 0;

  function shouldRun() {
    return !isPerfMode && !isAdaptiveLow && isTabVisible;
  }

  function syncState() {
    if (!shouldRun()) {
      canvas.style.opacity = '0';
      if (animId !== null) {
        cancelAnimationFrame(animId);
        animId = null;
      }
      ctx.clearRect(0, 0, W, H);
    } else {
      canvas.style.opacity = '1';
      if (animId === null) {
        lastFrameAt = performance.now();
        animId = requestAnimationFrame(animate);
      }
    }
  }

  window.addEventListener('pondosync-perf-change', (e) => {
    isPerfMode = Boolean(e.detail && e.detail.enabled);
    syncState();
  });

  window.addEventListener('pondosync-adaptive-low-gpu', (e) => {
    isAdaptiveLow = Boolean(e.detail && e.detail.enabled);
    syncState();
  });

  document.addEventListener('visibilitychange', () => {
    isTabVisible = !document.hidden;
    syncState();
  });

  function animate(now) {
    if (!shouldRun()) {
      animId = null;
      ctx.clearRect(0, 0, W, H);
      return;
    }

    animId = requestAnimationFrame(animate);

    const elapsed = now - lastFrameAt;
    if (elapsed < TARGET_INTERVAL) return;
    lastFrameAt = now - (elapsed % TARGET_INTERVAL);

    const frameScale = Math.min(elapsed / 16.6667, 3);

    ctx.clearRect(0, 0, W, H);

    const decay = Math.pow(0.85, frameScale);
    mouse.vx *= decay;
    mouse.vy *= decay;

    for (let i = 0; i < motes.length; i++) {
      motes[i].update(frameScale);
      motes[i].draw();
    }
  }

  if (shouldRun()) {
    lastFrameAt = performance.now();
    animId = requestAnimationFrame(animate);
  }
})();
