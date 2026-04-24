// ============================================
// Cursor Glow — Advanced Particle Trail
// Floating, dissolving, and optimized for performance
// ============================================

(function () {
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
    willChange: 'transform'
  });

  document.body.appendChild(canvas);

  let width, height;
  let particles = [];
  let mouseX = 0;
  let mouseY = 0;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let isMoving = false;
  let theme = document.documentElement.getAttribute('data-theme') || 'dark';

  // Resize handler
  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  window.addEventListener('resize', resize);
  resize();

  // Particle Class
  class Particle {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      // Randomize float speed and drift
      this.vx = (Math.random() - 0.5) * 0.4;
      this.vy = -Math.random() * 0.8 - 0.3;
      this.size = Math.random() * 40 + 30;
      this.baseSize = this.size;
      this.life = 1.0;
      this.decay = Math.random() * 0.03 + 0.02; // Faster fade (0.02 to 0.05)
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.life -= this.decay;
      this.size = this.baseSize * this.life;
    }

    draw() {
      if (this.life <= 0) return;

      const alpha = this.life * 0.08; // Even lower opacity for text readability
      // Brighter golden light colors
      const goldColor = theme === 'light' ? '212, 175, 55' : '255, 223, 118';

      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);

      // Large, soft glow for each particle (similar to the main cursor glow)
      const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
      gradient.addColorStop(0, `rgba(${goldColor}, ${alpha})`);
      gradient.addColorStop(1, `rgba(${goldColor}, 0)`);

      ctx.fillStyle = gradient;
      ctx.fill();
    }
  }

  // Track mouse position
  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;

    // Add particles if the mouse has moved enough (to save resources)
    const dist = Math.hypot(mouseX - lastMouseX, mouseY - lastMouseY);
    if (dist > 5) {
      // Create a few particles for a thicker trail
      for (let i = 0; i < 1; i++) {
        particles.push(new Particle(mouseX, mouseY));
      }
      lastMouseX = mouseX;
      lastMouseY = mouseY;
    }

    isMoving = true;
  });

  // Main loop
  function animate() {
    ctx.clearRect(0, 0, width, height);

    // Add a central soft glow at cursor (smaller radius)
    if (isMoving) {
      const centralAlpha = theme === 'light' ? 0.03 : 0.04;
      const glowRadius = 120; // Reduced from 150
      const gradient = ctx.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, glowRadius);
      gradient.addColorStop(0, `rgba(255, 223, 118, ${centralAlpha})`);
      gradient.addColorStop(1, 'rgba(255, 223, 118, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(mouseX - glowRadius, mouseY - glowRadius, glowRadius * 2, glowRadius * 2);
    }

    // Update and draw particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.update();
      if (p.life <= 0) {
        particles.splice(i, 1);
      } else {
        p.draw();
      }
    }

    // Limit particle count for performance
    if (particles.length > 150) {
      particles.shift();
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);

  // Theme Observer
  const observer = new MutationObserver(() => {
    theme = document.documentElement.getAttribute('data-theme') || 'dark';
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
