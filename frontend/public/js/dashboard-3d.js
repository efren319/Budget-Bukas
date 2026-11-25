/**
 * PondoSync Dashboard — 3D Background Model
 * Cinematic rendering with half-res bloom glow, on-demand shadow maps,
 * delta-time smoothing, and automatic adaptive GPU throttling on slower devices.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

(function () {
  'use strict';

  /* ---------- bail on small screens ---------- */
  const MQ_MIN = 900;
  if (window.innerWidth < MQ_MIN) {
    window.dispatchEvent(new Event('dashboard-3d-loaded'));
    return;
  }

  const canvas = document.getElementById('dashboard-3d-canvas');
  if (!canvas) {
    window.dispatchEvent(new Event('dashboard-3d-loaded'));
    return;
  }

  const isConstrainedDevice =
    (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
    Boolean(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  const MODEL_CONFIG = {
    path: 'assets/3d models/20 pesos.glb',
    xOffset: 4.5,
    yOffset: -0.5,
    zOffset: -2,
    scale: 7.5
  };

  const MAX_ROT = THREE.MathUtils.degToRad(10);

  let isPerfMode = Boolean(window.PondoSyncPerf && window.PondoSyncPerf.isEnabled());
  let isAdaptiveLow = document.documentElement.classList.contains('adaptive-low-gpu');

  function getMaxDpr() {
    if (isPerfMode || isAdaptiveLow) return 1;
    const cap = isConstrainedDevice ? 1.25 : 1.5;
    return Math.min(window.devicePixelRatio || 1, cap);
  }

  /* ========================================================
     RENDERER
     ======================================================== */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: !(isPerfMode || isConstrainedDevice),
    powerPreference: isPerfMode || isConstrainedDevice ? 'default' : 'high-performance'
  });
  renderer.setPixelRatio(getMaxDpr());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.55;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 1);

  /* ========================================================
     SCENE + CAMERA
     ======================================================== */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  /* ========================================================
     ENVIRONMENT MAP
     ======================================================== */
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  const envGeo = new THREE.SphereGeometry(5, 24, 12);
  const envMat = new THREE.MeshBasicMaterial({ color: 0x0c0a10, side: THREE.BackSide });
  envScene.add(new THREE.Mesh(envGeo, envMat));
  const envLight = new THREE.PointLight(0xdaa555, 0.3, 10);
  envLight.position.set(2, 2, 0);
  envScene.add(envLight);

  const envMap = pmrem.fromScene(envScene, 0, 0.1, 100).texture;
  scene.environment = envMap;
  envGeo.dispose();
  envMat.dispose();
  pmrem.dispose();

  /* ========================================================
     LIGHTING
     ======================================================== */
  scene.add(new THREE.AmbientLight(0x1e1822, 0.5));

  const keyLight = new THREE.SpotLight(0xdaa555, 4.5, 60, Math.PI / 2.5, 0.9, 1.8);
  keyLight.position.set(12, 4, 12);
  keyLight.target.position.set(MODEL_CONFIG.xOffset, MODEL_CONFIG.yOffset, MODEL_CONFIG.zOffset);
  keyLight.castShadow = !(isPerfMode || isAdaptiveLow);
  keyLight.shadow.mapSize.set(512, 512);
  scene.add(keyLight);
  scene.add(keyLight.target);

  const fillLight = new THREE.DirectionalLight(0x8a7a6a, 0.3);
  fillLight.position.set(-5, 2, 4);
  scene.add(fillLight);

  const rimLight = new THREE.PointLight(0xd4af37, 0.7, 20, 2);
  rimLight.position.set(5, 3, -5);
  scene.add(rimLight);

  /* ========================================================
     POST-PROCESSING — Half-res Bloom Glow
     ======================================================== */
  const container = canvas.parentElement || document.body;
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(getMaxDpr());

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const initW = Math.max(1, container.clientWidth || window.innerWidth);
  const initH = Math.max(1, container.clientHeight || window.innerHeight);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(Math.max(1, Math.floor(initW * 0.5)), Math.max(1, Math.floor(initH * 0.5))),
    0.4,
    1.2,
    0.6
  );
  bloomPass.enabled = !(isPerfMode || isAdaptiveLow);
  composer.addPass(bloomPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  /* ========================================================
     LOAD MODEL
     ======================================================== */
  let modelWrapper = null;
  let modelLoaded = false;
  let sceneDirty = true;
  let modelReadyAt = 0;

  const loader = new GLTFLoader();
  loader.load(
    MODEL_CONFIG.path,
    (gltf) => {
      const model = gltf.scene;

      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);

      modelWrapper = new THREE.Group();
      modelWrapper.add(model);

      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      modelWrapper.scale.setScalar(MODEL_CONFIG.scale / maxDim);
      modelWrapper.position.set(MODEL_CONFIG.xOffset, MODEL_CONFIG.yOffset, MODEL_CONFIG.zOffset);

      model.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        const mat = child.material;
        if (mat) {
          if (mat.metalness !== undefined) mat.metalness = Math.min(mat.metalness + 0.15, 0.95);
          if (mat.roughness !== undefined) mat.roughness = Math.max(mat.roughness - 0.1, 0.1);
          mat.envMap = envMap;
          mat.envMapIntensity = 1.3;
          if (mat.emissive && mat.emissiveIntensity !== undefined) {
            mat.emissiveIntensity = Math.max(mat.emissiveIntensity * 1.5, 0.8);
          }
          mat.needsUpdate = true;
        }
      });

      scene.add(modelWrapper);
      modelLoaded = true;
      sceneDirty = true;
      modelReadyAt = performance.now();
      renderer.shadowMap.needsUpdate = true;
      window.dispatchEvent(new Event('dashboard-3d-loaded'));
    },
    undefined,
    (err) => {
      console.warn('[dashboard-3d] Model load error:', err);
      modelLoaded = true;
      window.dispatchEvent(new Event('dashboard-3d-loaded'));
    }
  );

  /* ========================================================
     CURSOR TRACKING
     ======================================================== */
  const cursor = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  let introStarted = false;
  let introProgress = 0;

  window.addEventListener('dashboard-3d-loaded', () => {
    setTimeout(() => {
      introStarted = true;
      sceneDirty = true;
    }, 450);
  });

  function onMouseMove(e) {
    cursor.x = (e.clientX / window.innerWidth) * 2 - 1;
    cursor.y = (e.clientY / window.innerHeight) * 2 - 1;
    sceneDirty = true;
  }
  window.addEventListener('mousemove', onMouseMove, { passive: true });

  /* ========================================================
     RESIZE HANDLER
     ======================================================== */
  function resize() {
    const w = Math.max(1, container.clientWidth || window.innerWidth);
    const h = Math.max(1, container.clientHeight || window.innerHeight);
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloomPass.resolution.set(Math.max(1, Math.floor(w * 0.5)), Math.max(1, Math.floor(h * 0.5)));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    sceneDirty = true;
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });

  /* ========================================================
     PERFORMANCE MODE & ADAPTIVE GPU GOVERNOR
     ======================================================== */
  function syncQuality() {
    const lowMode = isPerfMode || isAdaptiveLow;
    bloomPass.enabled = !lowMode;
    keyLight.castShadow = !lowMode;
    const dpr = getMaxDpr();
    renderer.setPixelRatio(dpr);
    composer.setPixelRatio(dpr);
    if (!lowMode) {
      renderer.shadowMap.needsUpdate = true;
    }
    sceneDirty = true;
  }

  function activateAdaptiveLowPower() {
    if (isAdaptiveLow) return;
    isAdaptiveLow = true;
    document.documentElement.classList.add('adaptive-low-gpu');
    window.dispatchEvent(new CustomEvent('pondosync-adaptive-low-gpu', { detail: { enabled: true } }));
    syncQuality();
  }

  function onPerfChange(e) {
    isPerfMode = Boolean(e.detail && e.detail.enabled);
    syncQuality();
  }
  window.addEventListener('pondosync-perf-change', onPerfChange);

  /* ========================================================
     RENDER LOOP
     ======================================================== */
  let rafId = null;
  let lastDrawAt = 0;
  let prevTickAt = 0;
  let shadowTick = 0;
  let emaFrameMs = 16.7;
  let slowFrameStreak = 0;

  function getTargetIntervalMs() {
    if (isPerfMode || isAdaptiveLow) return 1000 / 30;
    if (isConstrainedDevice) return 1000 / 45;
    return 0;
  }

  function animate(now) {
    rafId = requestAnimationFrame(animate);

    if (document.hidden || !modelLoaded) return;

    const minInterval = getTargetIntervalMs();
    if (minInterval > 0) {
      const elapsed = now - lastDrawAt;
      if (elapsed < minInterval) return;
      lastDrawAt = now - (elapsed % minInterval);
    } else {
      lastDrawAt = now;
    }

    const rawDeltaMs = prevTickAt ? now - prevTickAt : 16.6667;
    prevTickAt = now;
    const dt = Math.min(Math.max(rawDeltaMs / 1000, 0.001), 0.05);

    if (!isPerfMode && !isAdaptiveLow && modelReadyAt && now - modelReadyAt > 2500 && rawDeltaMs < 250) {
      emaFrameMs = emaFrameMs * 0.92 + rawDeltaMs * 0.08;
      if (emaFrameMs > 34) {
        slowFrameStreak++;
        if (slowFrameStreak >= 30) {
          activateAdaptiveLowPower();
        }
      } else {
        slowFrameStreak = Math.max(0, slowFrameStreak - 1);
      }
    }

    const dx = cursor.x - current.x;
    const dy = cursor.y - current.y;
    const isCursorMoving = Math.abs(dx) > 0.0004 || Math.abs(dy) > 0.0004;
    if (isCursorMoving) {
      const cStep = 1 - Math.exp(-3.1 * dt);
      current.x += dx * cStep;
      current.y += dy * cStep;
    } else {
      current.x = cursor.x;
      current.y = cursor.y;
    }

    const isIntroAnimating = introStarted && introProgress < 1;

    // In Performance Mode, once coin settles, sleep cleanly until cursor moves again
    if (isPerfMode && !isCursorMoving && !isIntroAnimating && !sceneDirty) {
      return;
    }

    sceneDirty = false;

    if (modelWrapper) {
      const targetRotY = current.x * MAX_ROT;
      const targetRotX = THREE.MathUtils.clamp(current.y * MAX_ROT * 0.7, -MAX_ROT * 0.7, MAX_ROT * 0.7);
      const oscillation = isPerfMode ? 0 : Math.sin(now * 0.0006) * (Math.PI / 12);

      if (!introStarted) {
        modelWrapper.rotation.x = Math.PI / 5;
        modelWrapper.rotation.y = targetRotY + oscillation;
      } else {
        if (introProgress < 1) {
          introProgress = Math.min(1, introProgress + 0.6 * dt);
        }
        const eased = 1 - Math.pow(1 - introProgress, 4);
        const startX = Math.PI / 5;
        modelWrapper.rotation.x = startX + (targetRotX - startX) * eased;
        modelWrapper.rotation.y = targetRotY + oscillation;
      }

      if (!(isPerfMode || isAdaptiveLow)) {
        shadowTick = (shadowTick + 1) % 3;
        if (shadowTick === 0) {
          renderer.shadowMap.needsUpdate = true;
        }
      }
    }

    if (isPerfMode || isAdaptiveLow) {
      renderer.render(scene, camera);
    } else {
      composer.render();
    }
  }

  function disposeScene() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    window.removeEventListener('resize', resize);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('pondosync-perf-change', onPerfChange);

    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          for (const key of Object.keys(m)) {
            if (m[key] && typeof m[key].dispose === 'function') m[key].dispose();
          }
          m.dispose();
        }
      }
    });
    envMap.dispose();
    composer.dispose();
    renderer.dispose();
  }

  window.addEventListener('pagehide', disposeScene, { once: true });

  rafId = requestAnimationFrame(animate);
})();
