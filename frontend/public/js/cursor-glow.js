// ============================================
// Cursor Glow — On-Demand Cached Radial Sprite
// Zero idle CPU/GPU usage when cursor stops moving
// ============================================

(function () {
  'use strict';

  // Skip on touch devices or small screens
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;
  if (window.matchMedia('(max-width: 768px)').matches) return;

  const GLOW_RADIUS = 130;
  const SPRITE_SIZE = GLOW_RADIUS * 2;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  Object.assign(canvas.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: '9999',
    transition: 'opacity 0.3s ease'
  });

  document.body.appendChild(canvas);

  // Pre-render the radial gradient once onto a tiny sprite canvas
  const glowSprite = document.createElement('canvas');
  glowSprite.width = SPRITE_SIZE;
  glowSprite.height = SPRITE_SIZE;
  const spriteCtx = glowSprite.getContext('2d');
  const gradient = spriteCtx.createRadialGradient(
    GLOW_RADIUS, GLOW_RADIUS, 0,
    GLOW_RADIUS, GLOW_RADIUS, GLOW_RADIUS
  );
  gradient.addColorStop(0, 'rgba(212, 175, 55, 0.05)');
  gradient.addColorStop(1, 'rgba(212, 175, 55, 0)');
  spriteCtx.fillStyle = gradient;
  spriteCtx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

  let isPerfMode = Boolean(window.PondoSyncPerf && window.PondoSyncPerf.isEnabled());
  let isAdaptiveLow = document.documentElement.classList.contains('adaptive-low-gpu');
  let isTabVisible = !document.hidden;
  let animId = null;

  let width = 0;
  let height = 0;
  let mouseX = -9999;
  let mouseY = -9999;
  let lastDrawX = -9999;
  let lastDrawY = -9999;
  let hasActiveGlow = false;

  function clearDirtyArea() {
    if (lastDrawX > -GLOW_RADIUS && lastDrawY > -GLOW_RADIUS) {
      ctx.clearRect(
        lastDrawX - GLOW_RADIUS - 2,
        lastDrawY - GLOW_RADIUS - 2,
        SPRITE_SIZE + 4,
        SPRITE_SIZE + 4
      );
      lastDrawX = -9999;
      lastDrawY = -9999;
    }
  }

  function clearGlow() {
    hasActiveGlow = false;
    mouseX = -9999;
    mouseY = -9999;
    if (width && height) {
      ctx.clearRect(0, 0, width, height);
    }
    lastDrawX = -9999;
    lastDrawY = -9999;
  }

  function isPaused() {
    return isPerfMode || isAdaptiveLow || !isTabVisible;
  }

  function scheduleRender() {
    if (isPaused() || animId !== null) return;
    animId = requestAnimationFrame(renderFrame);
  }

  function syncVisibility() {
    if (isPerfMode || isAdaptiveLow) {
      if (animId !== null) {
        cancelAnimationFrame(animId);
        animId = null;
      }
      clearGlow();
      canvas.style.display = 'none';
      canvas.style.visibility = 'hidden';
      canvas.style.opacity = '0';
    } else {
      canvas.style.display = 'block';
      canvas.style.visibility = 'visible';
      canvas.style.opacity = '1';
      if (hasActiveGlow && isTabVisible) {
        scheduleRender();
      }
    }
  }

  if (isPerfMode || isAdaptiveLow) {
    syncVisibility();
  }

  window.addEventListener('pondosync-perf-change', (e) => {
    isPerfMode = Boolean(e.detail && e.detail.enabled);
    syncVisibility();
  });

  window.addEventListener('pondosync-adaptive-low-gpu', (e) => {
    isAdaptiveLow = Boolean(e.detail && e.detail.enabled);
    syncVisibility();
  });

  document.addEventListener('visibilitychange', () => {
    isTabVisible = !document.hidden;
    if (!isTabVisible && animId !== null) {
      cancelAnimationFrame(animId);
      animId = null;
    } else if (isTabVisible && hasActiveGlow && !isPaused()) {
      scheduleRender();
    }
  });

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    // Soft glow needs no >1x DPR pixel scaling
    canvas.width = width;
    canvas.height = height;
    lastDrawX = -9999;
    lastDrawY = -9999;
    if (!isPaused() && hasActiveGlow) {
      scheduleRender();
    }
  }

  window.addEventListener('resize', resize, { passive: true });
  resize();

  window.addEventListener('mousemove', (e) => {
    if (isPaused()) return;
    mouseX = e.clientX;
    mouseY = e.clientY;
    hasActiveGlow = true;
    scheduleRender();
  }, { passive: true });

  document.addEventListener('mouseleave', () => {
    hasActiveGlow = false;
    clearDirtyArea();
  }, { passive: true });

  function renderFrame() {
    animId = null;
    if (isPaused() || !hasActiveGlow) {
      clearDirtyArea();
      return;
    }

    clearDirtyArea();
    ctx.drawImage(glowSprite, mouseX - GLOW_RADIUS, mouseY - GLOW_RADIUS);
    lastDrawX = mouseX;
    lastDrawY = mouseY;
  }
})();
