// ============================================
// Cursor Glow — Simple Cursor Highlight
// Clean and optimized for performance
// ============================================

(function () {
  'use strict';

  // Skip on touch devices or small screens
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;
  if (window.matchMedia('(max-width: 768px)').matches) return;

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
    willChange: 'transform',
    transition: 'opacity 0.3s ease'
  });

  document.body.appendChild(canvas);

  let isPerfMode = Boolean(window.PondoSyncPerf && window.PondoSyncPerf.isEnabled());
  let isTabVisible = !document.hidden;
  let animId = null;

  function clearGlow() {
    isMoving = false;
    mouseX = -9999;
    mouseY = -9999;
    if (width && height) {
      ctx.clearRect(0, 0, width, height);
    }
  }

  function applyPerfMode(perf) {
    isPerfMode = perf;
    if (perf) {
      if (animId) {
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
      if (!animId && isTabVisible) {
        animId = requestAnimationFrame(animate);
      }
    }
  }

  if (isPerfMode) {
    canvas.style.display = 'none';
    canvas.style.visibility = 'hidden';
    canvas.style.opacity = '0';
  }

  window.addEventListener('pondosync-perf-change', (e) => {
    applyPerfMode(e.detail.enabled);
  });

  document.addEventListener('visibilitychange', () => {
    isTabVisible = !document.hidden;
    if (isTabVisible && !isPerfMode && !animId) {
      animId = requestAnimationFrame(animate);
    }
  });

  let width, height;
  let mouseX = -9999;
  let mouseY = -9999;
  let isMoving = false;

  // Resize handler
  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    if (isPerfMode) {
      ctx.clearRect(0, 0, width, height);
    }
  }

  window.addEventListener('resize', resize);
  resize();

  // Track mouse position (completely bypassed when in Performance Mode)
  window.addEventListener('mousemove', (e) => {
    if (isPerfMode) return;
    mouseX = e.clientX;
    mouseY = e.clientY;
    isMoving = true;
  });

  // Main loop
  function animate() {
    if (isPerfMode || !isTabVisible) {
      animId = null;
      ctx.clearRect(0, 0, width, height);
      return;
    }

    ctx.clearRect(0, 0, width, height);

    // Add a central soft glow at cursor (smaller radius)
    if (isMoving) {
      const centralAlpha = 0.05;
      const glowRadius = 130; 
      const gradient = ctx.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, glowRadius);
      gradient.addColorStop(0, `rgba(212, 175, 55, ${centralAlpha})`);
      gradient.addColorStop(1, 'rgba(212, 175, 55, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(mouseX - glowRadius, mouseY - glowRadius, glowRadius * 2, glowRadius * 2);
    }

    animId = requestAnimationFrame(animate);
  }

  if (!isPerfMode && isTabVisible) {
    animId = requestAnimationFrame(animate);
  }
})();
