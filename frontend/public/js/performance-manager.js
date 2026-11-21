/**
 * PondoSync — Performance Mode Manager
 * Centralized settings manager for visual performance, GPU/CPU & RAM optimization.
 * Persists user preference in localStorage and broadcasts mode changes to all components.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'pondosync_perf_mode';

  function getStoredPreference() {
    try {
      const val = localStorage.getItem(STORAGE_KEY);
      if (val !== null) return val === 'true';
    } catch (e) {
      console.warn('[PondoSyncPerf] localStorage access error:', e);
    }
    // Respect OS prefers-reduced-motion as a sensible initial default if never set
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  let enabled = getStoredPreference();

  function applyDOMClass(isPerf) {
    document.documentElement.classList.toggle('performance-mode', isPerf);
    if (document.body) {
      document.body.classList.toggle('performance-mode', isPerf);
    }
  }

  // Ensure DOM has class as early as possible
  applyDOMClass(enabled);

  function syncToggleButtons() {
    const btns = document.querySelectorAll('.perf-toggle-btn');
    btns.forEach(btn => {
      btn.setAttribute('aria-checked', enabled ? 'true' : 'false');
      btn.classList.toggle('active', enabled);
      const label = enabled ? 'Performance Mode: ON' : 'Performance Mode: OFF';
      btn.setAttribute('title', label);
      btn.setAttribute('aria-label', label);
    });

    const tooltips = document.querySelectorAll('.perf-tooltip');
    tooltips.forEach(tt => {
      tt.textContent = enabled ? 'Performance Mode: ON' : 'Performance Mode: OFF';
    });
  }

  function setMode(isPerf, save = true) {
    enabled = Boolean(isPerf);
    if (save) {
      try {
        localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
      } catch (e) {
        console.warn('[PondoSyncPerf] Failed to save preference:', e);
      }
    }

    applyDOMClass(enabled);
    syncToggleButtons();

    // Broadcast change event to all components
    window.dispatchEvent(new CustomEvent('pondosync-perf-change', {
      detail: { enabled }
    }));
  }

  function toggle() {
    setMode(!enabled);
  }

  // Expose global manager
  window.PondoSyncPerf = {
    isEnabled: () => enabled,
    setMode,
    toggle,
    addListener: (cb) => {
      window.addEventListener('pondosync-perf-change', (e) => cb(e.detail.enabled));
    }
  };

  // Wire up all toggle buttons
  function initUI() {
    applyDOMClass(enabled);
    syncToggleButtons();

    document.querySelectorAll('.perf-toggle-btn').forEach(btn => {
      btn.removeEventListener('click', toggle);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggle();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }
})();

