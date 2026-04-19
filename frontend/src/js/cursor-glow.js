// ============================================
// Cursor Glow — Subtle gold follow effect
// Disabled on mobile/touch devices
// ============================================

(function () {
  // Skip on touch devices
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;
  if (window.matchMedia('(max-width: 768px)').matches) return;

  // Create glow element
  const glow = document.createElement('div');
  glow.id = 'cursor-glow';
  glow.setAttribute('aria-hidden', 'true');

  Object.assign(glow.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '320px',
    height: '320px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(212,175,55,0.07) 0%, rgba(212,175,55,0.02) 40%, transparent 70%)',
    pointerEvents: 'none',
    zIndex: '9999',
    transform: 'translate(-50%, -50%)',
    transition: 'opacity 0.3s ease',
    opacity: '0',
    willChange: 'transform'
  });

  document.body.appendChild(glow);

  let mouseX = 0;
  let mouseY = 0;
  let glowX = 0;
  let glowY = 0;
  let visible = false;

  // Track mouse position
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;

    if (!visible) {
      visible = true;
      glow.style.opacity = '1';
    }
  });

  // Hide when mouse leaves window
  document.addEventListener('mouseleave', () => {
    visible = false;
    glow.style.opacity = '0';
  });

  // Smooth follow with requestAnimationFrame
  function animate() {
    // Easing factor — lower = smoother/slower follow
    const ease = 0.12;

    glowX += (mouseX - glowX) * ease;
    glowY += (mouseY - glowY) * ease;

    glow.style.transform = `translate(${glowX - 160}px, ${glowY - 160}px)`;

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);

  // Respect light mode — reduce opacity
  const observer = new MutationObserver(() => {
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme === 'light') {
      glow.style.background = 'radial-gradient(circle, rgba(212,175,55,0.04) 0%, rgba(212,175,55,0.01) 40%, transparent 70%)';
    } else {
      glow.style.background = 'radial-gradient(circle, rgba(212,175,55,0.07) 0%, rgba(212,175,55,0.02) 40%, transparent 70%)';
    }
  });

  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
