// ============================================
// Dust Particles — Physics-based with cursor wind interaction
// Floating golden dust motes that are pushed by the cursor
// like wind, lit by the ambient scene light.
// ============================================

(function () {
  'use strict';

  // Skip on touch devices
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;
  if (window.matchMedia('(max-width: 900px)').matches) return;

  /* ========================================================
     CANVAS SETUP
     ======================================================== */
  const canvas = document.createElement('canvas');
  const ctx    = canvas.getContext('2d');

  Object.assign(canvas.style, {
    position:      'fixed',
    top:           '0',
    left:          '0',
    width:         '100vw',
    height:        '100vh',
    pointerEvents: 'none',
    zIndex:        '10',      // above 3D canvas, below UI
    willChange:    'transform'
  });

  document.body.appendChild(canvas);

  let W = 0, H = 0;

  function resize() {
    const dpr   = Math.min(window.devicePixelRatio, 2);
    W           = window.innerWidth;
    H           = window.innerHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
  }

  window.addEventListener('resize', resize);
  resize();

  /* ========================================================
     MOUSE TRACKING
     ======================================================== */
  const mouse = { x: -9999, y: -9999, vx: 0, vy: 0 };
  let lastMX = -9999, lastMY = -9999;

  window.addEventListener('mousemove', (e) => {
    mouse.vx  = e.clientX - lastMX;
    mouse.vy  = e.clientY - lastMY;
    lastMX    = mouse.x = e.clientX;
    lastMY    = mouse.y = e.clientY;
  });

  /* ========================================================
     LIGHT SOURCES  (approximate the 3-D spotlights)
     ======================================================== */
  // Two warm gold "spotlight" pools — left and right, top region
  // These drive the dust brightness per-particle
  const LIGHTS = [
    { rx: 0.12, ry: 0.35, radius: 0.32 },  // left spotlight
    { rx: 0.88, ry: 0.35, radius: 0.32 }   // right spotlight
  ];

  function lightAt(px, py) {
    // Returns 0-1 brightness based on proximity to any light
    let max = 0;
    for (const L of LIGHTS) {
      const lx   = L.rx * W;
      const ly   = L.ry * H;
      const dist = Math.hypot(px - lx, py - ly);
      const val  = Math.max(0, 1 - dist / (L.radius * Math.max(W, H)));
      if (val > max) max = val;
    }
    return max;
  }

  /* ========================================
     DUST MOTE CLASS
     ======================================== */
  const WIND_RADIUS  = 180;   // how far cursor wind reaches
  const WIND_FORCE   = 0.045; // strength of push
  const DRAG         = 0.98;  // velocity damping (slow floating)
  const DRIFT_FORCE  = 0.012; // increased random Brownian drift

  class Dust {
    constructor() {
      this.reset(true);
    }

    reset(anywhere = false) {
      // Scatter randomly across the full screen
      this.x    = Math.random() * W;
      this.y    = Math.random() * H;
      this.vx   = (Math.random() - 0.5) * 0.2;
      this.vy   = (Math.random() - 0.5) * 0.2;
      this.r    = Math.random() * 0.9 + 0.4; // Slightly bigger for visibility (0.4 - 1.3px)
      this.life = Math.random() * 0.6 + 0.4;
      
      // Shimmering / reflective sparkle property
      this.shimmer = Math.random() * Math.PI * 2;
      this.shimmerSpeed = Math.random() * 0.04 + 0.01;

      // Random "emission" spike (occasional flash)
      this.emission = 0;
      this.emissionTarget = 0;
    }

    update() {
      // --- Pure random floating (no gravity) ---
      this.vx += (Math.random() - 0.5) * DRIFT_FORCE;
      this.vy += (Math.random() - 0.5) * DRIFT_FORCE;

      // --- Cursor wind repulsion ---
      const dx   = this.x - mouse.x;
      const dy   = this.y - mouse.y;
      const dist = Math.hypot(dx, dy);

      if (dist < WIND_RADIUS && dist > 0) {
        const strength = (1 - dist / WIND_RADIUS) * WIND_FORCE;
        this.vx += (dx / dist) * strength * 3.5 + mouse.vx * strength * 0.3;
        this.vy += (dy / dist) * strength * 3.5 + mouse.vy * strength * 0.3;
      }

      // --- Damping ---
      this.vx *= DRAG;
      this.vy *= DRAG;

      // --- Move ---
      this.x += this.vx;
      this.y += this.vy;

      // --- Wrap around screen edges for continuous floating ---
      if (this.x < -10) this.x = W + 10;
      if (this.x > W + 10) this.x = -10;
      if (this.y < -10) this.y = H + 10;
      if (this.y > H + 10) this.y = -10;

      // --- Shimmer ---
      this.shimmer += this.shimmerSpeed;

      // --- Random Light Emission Spikes ---
      if (Math.random() < 0.001) { // Rare chance to start a flash
        this.emissionTarget = Math.random() * 0.8 + 0.2;
      }
      // Smoothly transition emission
      this.emission += (this.emissionTarget - this.emission) * 0.1;
      if (this.emission > this.emissionTarget * 0.95) this.emissionTarget = 0;
    }

    draw() {
      const litRaw = lightAt(this.x, this.y);
      const lit = Math.pow(litRaw, 2.0); // Slightly softer than before for better visibility
      
      const sparkle = (Math.sin(this.shimmer) * 0.5 + 0.5);
      
      // visibility: base (0.05) + light (lit) + random emission (this.emission)
      let alpha = this.life * (0.05 + lit * 0.7 + this.emission * 0.6) * (0.5 + sparkle * 0.5);

      if (alpha < 0.05) return;

      // Color: Warm grey -> Gold/White based on light and emission
      const intensity = Math.max(lit, this.emission);
      const r = Math.round(160 + intensity * 95); 
      const g = Math.round(150 + intensity * 70); 
      const b = Math.round(130 + intensity * 20); 

      ctx.beginPath();
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      
      // Draw as a sharp, tiny point
      const drawRadius = this.r * (1 + intensity * 0.4);
      ctx.arc(this.x, this.y, drawRadius, 0, Math.PI * 2);
      ctx.fill();
      
      // If emitting or highly lit, add a tiny sharp glint point
      if (intensity > 0.7) {
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
          ctx.beginPath();
          ctx.arc(this.x, this.y, drawRadius * 0.5, 0, Math.PI * 2);
          ctx.fill();
      }
    }
  }

  /* ========================================================
     PARTICLE POOL
     ======================================================== */
  const COUNT  = 180;
  const motes  = Array.from({ length: COUNT }, () => new Dust());

  /* ========================================================
     RENDER LOOP
     ======================================================== */
  function animate() {
    ctx.clearRect(0, 0, W, H);

    // Slowly decay mouse velocity each frame so effect fades
    mouse.vx *= 0.85;
    mouse.vy *= 0.85;

    for (const m of motes) {
      m.update();
      m.draw();
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
})();
