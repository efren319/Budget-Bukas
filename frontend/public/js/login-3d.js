/**
 * PondoSync — 3D Background & Landing Centerpiece
 *
 * - Landing View: Loads the optimized JPCS 3D centerpiece immediately
 *   (without blocking on BSU logo download), rotates smoothly with delta-time
 *   normalization, and adapts GPU quality automatically on slower devices.
 * - Login View: Displays BOTH 3D logos (JPCS on left, BSU on right) flanking
 *   the login card, sleeping cleanly when the cursor settles.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

(function () {
  'use strict';

  const canvas = document.getElementById('login-3d-canvas');
  if (!canvas) {
    window.dispatchEvent(new Event('3d-models-loaded'));
    return;
  }

  const container = canvas.parentElement || document.body;

  const isConstrainedDevice =
    (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
    Boolean(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

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
  renderer.toneMappingExposure = 0.65;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false; // Updated on demand only to avoid redundant passes
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 1);

  /* ========================================================
     SCENE + CAMERA
     ======================================================== */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 8);

  /* ========================================================
     ENVIRONMENT MAP — warm dark sphere for subtle reflections
     ======================================================== */
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  const envSphereGeo = new THREE.SphereGeometry(5, 24, 12);
  const envSphereMat = new THREE.MeshBasicMaterial({ color: 0x0c0a10, side: THREE.BackSide });
  envScene.add(new THREE.Mesh(envSphereGeo, envSphereMat));
  const envPt = new THREE.PointLight(0xdaa555, 0.4, 10);
  envPt.position.set(2, 2, 0);
  envScene.add(envPt);

  const envMap = pmrem.fromScene(envScene, 0, 0.1, 100).texture;
  scene.environment = envMap;
  envSphereGeo.dispose();
  envSphereMat.dispose();
  pmrem.dispose();

  /* ========================================================
     LIGHTING — Balanced cinematic gold lighting
     ======================================================== */
  const ambientLight = new THREE.AmbientLight(0x221a16, 0.7);
  scene.add(ambientLight);

  const keyLightLeft = new THREE.SpotLight(0xdaa555, 2.0, 32, Math.PI / 3, 0.8, 1.8);
  keyLightLeft.position.set(-6, 4, 5);
  keyLightLeft.target.position.set(-4.8, 0, 0);
  keyLightLeft.castShadow = false; // Enabled only when transitioning into login view
  keyLightLeft.shadow.mapSize.set(512, 512);
  keyLightLeft.shadow.bias = -0.0005;
  keyLightLeft.shadow.radius = 4;
  scene.add(keyLightLeft);
  scene.add(keyLightLeft.target);

  const keyLightRight = new THREE.SpotLight(0xdaa555, 2.0, 32, Math.PI / 3, 0.8, 1.8);
  keyLightRight.position.set(6, 4, 5);
  keyLightRight.target.position.set(4.8, 0, 0);
  keyLightRight.castShadow = false; // Enabled only when BSU & login view are active
  keyLightRight.shadow.mapSize.set(512, 512);
  keyLightRight.shadow.bias = -0.0005;
  keyLightRight.shadow.radius = 4;
  scene.add(keyLightRight);
  scene.add(keyLightRight.target);

  const centerKeyLight = new THREE.SpotLight(0xf5d080, 2.8, 30, Math.PI / 3, 0.6, 1.5);
  centerKeyLight.position.set(0, 3.5, 6);
  centerKeyLight.target.position.set(0, -1.8, 0);
  centerKeyLight.castShadow = !(isPerfMode || isAdaptiveLow);
  centerKeyLight.shadow.mapSize.set(512, 512);
  centerKeyLight.shadow.bias = -0.0005;
  scene.add(centerKeyLight);
  scene.add(centerKeyLight.target);

  const centerRimLight = new THREE.PointLight(0xffe090, 1.8, 16, 2);
  centerRimLight.position.set(0, 3.2, 1.5);
  scene.add(centerRimLight);

  const fillLight = new THREE.DirectionalLight(0x8a7a6a, 0.4);
  fillLight.position.set(0, 2, 4);
  scene.add(fillLight);

  const rimTop = new THREE.PointLight(0xd4af37, 0.8, 20, 2);
  rimTop.position.set(0, 3, -4);
  scene.add(rimTop);

  /* ========================================================
     GROUND PLANES (Shadow & Reflection)
     ======================================================== */
  const shadowGeo = new THREE.PlaneGeometry(18, 8);
  const shadowMat = new THREE.ShadowMaterial({ opacity: 0.28, color: 0x000000 });
  const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = -1.7;
  shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);

  const reflGeo = new THREE.PlaneGeometry(18, 8);
  const reflMat = new THREE.MeshStandardMaterial({
    color: 0x0c0a10,
    metalness: 0.95,
    roughness: 0.6,
    transparent: true,
    opacity: 0.12,
    envMap: envMap,
    envMapIntensity: 0.4
  });
  const reflectionPlane = new THREE.Mesh(reflGeo, reflMat);
  reflectionPlane.rotation.x = -Math.PI / 2;
  reflectionPlane.position.y = -1.69;
  reflectionPlane.receiveShadow = true;
  scene.add(reflectionPlane);

  /* ========================================================
     POST-PROCESSING — Half-res Bloom Glow
     ======================================================== */
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(getMaxDpr());

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const initW = Math.max(1, container.clientWidth || window.innerWidth);
  const initH = Math.max(1, container.clientHeight || window.innerHeight);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(Math.max(1, Math.floor(initW * 0.5)), Math.max(1, Math.floor(initH * 0.5))),
    0.42,
    1.1,
    0.65
  );
  bloomPass.enabled = !(isPerfMode || isAdaptiveLow);
  composer.addPass(bloomPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  /* ========================================================
     MODEL LOADING — JPCS immediate, BSU lazy/on-demand
     ======================================================== */
  let jpcsWrapper = null;
  let jpcsLandingPivot = null;
  const jpcsCounterQuat = new THREE.Quaternion();
  let bsuWrapper = null;
  let jpcsMaxDim = 1;
  let bsuMaxDim = 1;

  let jpcsLoaded = false;
  let bsuLoadStarted = false;
  let sceneDirty = true;
  let modelsVisibleAt = 0;

  const LOGIN_SCALE_JPCS = 3.8;
  const LOGIN_SCALE_BSU = 4.2;

  let landingScaleJPCS = 4.8;
  let landingPosY = -1.8;
  let loginXOffset = 4.8;

  const loader = new GLTFLoader();
  const isInitialLogin = window.location.hash === '#login';

  function setupModelMaterials(model) {
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;

      const mat = child.material;
      if (!mat) return;

      if (mat.metalness !== undefined) {
        mat.metalness = Math.min(mat.metalness + 0.1, 0.92);
      }
      if (mat.roughness !== undefined) {
        mat.roughness = Math.max(mat.roughness - 0.05, 0.22);
      }
      mat.envMap = envMap;
      mat.envMapIntensity = 0.8;
      if (mat.emissive && mat.emissiveIntensity !== undefined) {
        mat.emissiveIntensity = Math.max(mat.emissiveIntensity * 1.2, 0.5);
      }
      mat.needsUpdate = true;
    });
  }

  function loadBsuLogo() {
    if (bsuLoadStarted) return;
    bsuLoadStarted = true;

    loader.load(
      'assets/3d models/BSU logo.glb',
      (gltf) => {
        const model = gltf.scene;

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);

        bsuWrapper = new THREE.Group();
        bsuWrapper.add(model);

        const size = box.getSize(new THREE.Vector3());
        bsuMaxDim = Math.max(size.x, size.y, size.z) || 1;

        setupModelMaterials(model);

        bsuWrapper.position.set(12, 0, 0);
        bsuWrapper.scale.setScalar(LOGIN_SCALE_BSU / bsuMaxDim);
        bsuWrapper.visible = false;

        scene.add(bsuWrapper);
        sceneDirty = true;
        renderer.shadowMap.needsUpdate = true;
      },
      undefined,
      (err) => {
        console.warn('[login-3d] Error loading BSU logo:', err);
      }
    );
  }

  // Load JPCS immediately for fast landing appearance
  loader.load(
    'assets/3d models/JPCS logo.glb',
    (gltf) => {
      const model = gltf.scene;

      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);

      model.traverse((child) => {
        if (child.isMesh && child.parent) {
          jpcsCounterQuat.copy(child.quaternion).invert();
        }
      });

      jpcsLandingPivot = new THREE.Group();
      jpcsLandingPivot.add(model);

      jpcsWrapper = new THREE.Group();
      jpcsWrapper.add(jpcsLandingPivot);

      const size = box.getSize(new THREE.Vector3());
      jpcsMaxDim = Math.max(size.x, size.y, size.z) || 1;

      setupModelMaterials(model);

      updateDimensions();
      jpcsWrapper.position.set(0, landingPosY, 0);
      jpcsWrapper.scale.setScalar(landingScaleJPCS / jpcsMaxDim);

      scene.add(jpcsWrapper);
      jpcsLoaded = true;
      sceneDirty = true;
      modelsVisibleAt = performance.now();
      renderer.shadowMap.needsUpdate = true;

      window.dispatchEvent(new Event('3d-models-loaded'));

      // Lazy-load BSU only after landing coin renders (or skip idle prefetch on Save-Data)
      if (isInitialLogin) {
        loadBsuLogo();
      } else if (!(navigator.connection && navigator.connection.saveData)) {
        const idleSchedule = window.requestIdleCallback || ((fn) => setTimeout(fn, 1400));
        idleSchedule(() => loadBsuLogo(), { timeout: 2500 });
      }
    },
    undefined,
    (err) => {
      console.warn('[login-3d] Error loading JPCS logo:', err);
      jpcsLoaded = true;
      window.dispatchEvent(new Event('3d-models-loaded'));
    }
  );

  if (isInitialLogin) {
    loadBsuLogo();
  }

  /* ========================================================
     RESPONSIVE POSITIONING & SIZING
     ======================================================== */
  function updateDimensions() {
    const w = Math.max(1, container.clientWidth || window.innerWidth);
    const h = Math.max(1, container.clientHeight || window.innerHeight);

    renderer.setSize(w, h);
    composer.setSize(w, h);
    // Keep bloom at half resolution to cut GPU fill cost by 75%
    bloomPass.resolution.set(Math.max(1, Math.floor(w * 0.5)), Math.max(1, Math.floor(h * 0.5)));
    camera.aspect = w / h;

    camera.position.z = camera.aspect < 1.5 ? 10 : 8;
    camera.updateProjectionMatrix();

    const frustumH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const frustumW = frustumH * camera.aspect;

    const landingDiam = Math.min(7.4, Math.max(4.8, frustumW * 0.60));
    landingScaleJPCS = landingDiam;

    const topRimY = -(frustumH * 0.09);
    landingPosY = topRimY - (landingDiam / 2);

    loginXOffset = Math.min(4.8, frustumW * 0.42);

    centerKeyLight.position.set(0, topRimY + 3.0, 5.5);
    centerKeyLight.target.position.set(0, topRimY - 0.5, 0);
    centerKeyLight.target.updateMatrixWorld();
    centerRimLight.position.set(0, topRimY + 0.6, 1.2);
    sceneDirty = true;
  }

  updateDimensions();
  window.addEventListener('resize', updateDimensions, { passive: true });

  /* ========================================================
     VIEW STATE & TRANSITIONS
     ======================================================== */
  let targetViewBlend = isInitialLogin ? 1.0 : 0.0;
  let viewBlend = targetViewBlend;

  function onViewToLogin() {
    loadBsuLogo();
    targetViewBlend = 1.0;
    sceneDirty = true;
  }

  function onViewToLanding() {
    targetViewBlend = 0.0;
    sceneDirty = true;
  }

  window.addEventListener('pondo-view-login', onViewToLogin);
  window.addEventListener('pondo-coin-exit', onViewToLogin);
  window.addEventListener('pondo-view-landing', onViewToLanding);
  window.addEventListener('pondo-coin-enter', onViewToLanding);

  // Pre-trigger BSU load on hover/focus of Get Started button
  const getStartedBtn = document.getElementById('btn-get-started');
  if (getStartedBtn) {
    getStartedBtn.addEventListener('pointerenter', loadBsuLogo, { passive: true, once: true });
    getStartedBtn.addEventListener('click', loadBsuLogo, { passive: true, once: true });
  }

  /* ========================================================
     CURSOR TRACKING
     ======================================================== */
  const cursor = { x: 0, y: 0 };
  const currentCursor = { x: 0, y: 0 };
  const MAX_ROT = THREE.MathUtils.degToRad(12);
  let introStarted = false;
  let introProgress = 0;

  window.addEventListener('3d-models-loaded', () => {
    setTimeout(() => {
      introStarted = true;
      sceneDirty = true;
    }, 350);
  });

  function onMouseMove(e) {
    cursor.x = (e.clientX / window.innerWidth) * 2 - 1;
    cursor.y = (e.clientY / window.innerHeight) * 2 - 1;
    sceneDirty = true;
  }
  window.addEventListener('mousemove', onMouseMove, { passive: true });

  /* ========================================================
     PERFORMANCE MODE & ADAPTIVE GPU GOVERNOR
     ======================================================== */
  function syncRendererQuality() {
    const lowMode = isPerfMode || isAdaptiveLow;
    bloomPass.enabled = !lowMode;
    const dpr = getMaxDpr();
    renderer.setPixelRatio(dpr);
    composer.setPixelRatio(dpr);
    if (lowMode) {
      keyLightLeft.castShadow = false;
      keyLightRight.castShadow = false;
      centerKeyLight.castShadow = false;
    } else {
      renderer.shadowMap.needsUpdate = true;
    }
    sceneDirty = true;
  }

  function activateAdaptiveLowPower() {
    if (isAdaptiveLow) return;
    isAdaptiveLow = true;
    document.documentElement.classList.add('adaptive-low-gpu');
    window.dispatchEvent(new CustomEvent('pondosync-adaptive-low-gpu', { detail: { enabled: true } }));
    syncRendererQuality();
  }

  function onPerfChange(e) {
    isPerfMode = Boolean(e.detail && e.detail.enabled);
    syncRendererQuality();
  }
  window.addEventListener('pondosync-perf-change', onPerfChange);

  /* ========================================================
     RENDER LOOP (Delta-Time Normalized, Zero Per-Frame Alloc)
     ======================================================== */
  let rafId = null;
  let lastDrawAt = 0;
  let prevTickAt = 0;
  let shadowTick = 0;
  let landingSpinZ = 0;

  // Sustained FPS monitor state
  let emaFrameMs = 16.7;
  let slowFrameStreak = 0;

  // Pre-allocated math temporaries (eliminates 120+ heap allocations/sec)
  const identityQuat = new THREE.Quaternion();
  const _zAxis = new THREE.Vector3(0, 0, 1);
  const _qSpin = new THREE.Quaternion();
  const _landingQuat = new THREE.Quaternion();

  function getTargetIntervalMs() {
    if (isPerfMode || isAdaptiveLow) return 1000 / 30;
    if (isConstrainedDevice) return 1000 / 45;
    return 0;
  }

  function animate(now) {
    rafId = requestAnimationFrame(animate);

    if (document.hidden || !jpcsLoaded) return;

    const minInterval = getTargetIntervalMs();
    if (minInterval > 0) {
      const sinceDraw = now - lastDrawAt;
      if (sinceDraw < minInterval) return;
      lastDrawAt = now - (sinceDraw % minInterval);
    } else {
      lastDrawAt = now;
    }

    const rawDeltaMs = prevTickAt ? now - prevTickAt : 16.6667;
    prevTickAt = now;
    const dt = Math.min(Math.max(rawDeltaMs / 1000, 0.001), 0.05);

    // Measure sustained frame lag only after initial model settle
    if (!isPerfMode && !isAdaptiveLow && modelsVisibleAt && now - modelsVisibleAt > 2500 && rawDeltaMs < 250) {
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

    // Smooth view interpolation
    const dBlend = targetViewBlend - viewBlend;
    const isViewTransitioning = Math.abs(dBlend) > 0.001;
    if (isViewTransitioning) {
      viewBlend += dBlend * (1 - Math.exp(-4.7 * dt));
    } else {
      viewBlend = targetViewBlend;
    }

    // Cursor interpolation (delta-time normalized)
    const dx = cursor.x - currentCursor.x;
    const dy = cursor.y - currentCursor.y;
    const isCursorMoving = Math.abs(dx) > 0.0004 || Math.abs(dy) > 0.0004;
    if (isCursorMoving) {
      const cStep = 1 - Math.exp(-3.7 * dt);
      currentCursor.x += dx * cStep;
      currentCursor.y += dy * cStep;
    } else {
      currentCursor.x = cursor.x;
      currentCursor.y = cursor.y;
    }

    const isIntroAnimating = introStarted && introProgress < 1;

    // On Login view with zero motion, sleep GPU cleanly until cursor moves or view changes
    if (
      viewBlend >= 0.999 &&
      !isViewTransitioning &&
      !isCursorMoving &&
      !isIntroAnimating &&
      !sceneDirty
    ) {
      return;
    }

    sceneDirty = false;

    // Selective lighting & shadow passes
    const lowMode = isPerfMode || isAdaptiveLow;
    centerKeyLight.intensity = THREE.MathUtils.lerp(2.8, 0.2, viewBlend);
    centerRimLight.intensity = THREE.MathUtils.lerp(1.8, 0.0, viewBlend);
    keyLightLeft.intensity = THREE.MathUtils.lerp(0.8, 2.0, viewBlend);
    keyLightRight.intensity = THREE.MathUtils.lerp(0.2, 2.0, viewBlend);

    shadowPlane.position.y = THREE.MathUtils.lerp(-4.0, -1.7, viewBlend);
    reflectionPlane.position.y = THREE.MathUtils.lerp(-3.99, -1.69, viewBlend);

    if (!lowMode) {
      const inLoginZone = viewBlend > 0.02;
      keyLightLeft.castShadow = inLoginZone;
      keyLightRight.castShadow = inLoginZone && Boolean(bsuWrapper && bsuWrapper.visible);
      centerKeyLight.castShadow = viewBlend < 0.7;

      // Update shadow maps throttled cleanly instead of every single frame
      shadowTick = (shadowTick + 1) % 3;
      if (shadowTick === 0) {
        renderer.shadowMap.needsUpdate = true;
      }
    }

    const targetRotY = THREE.MathUtils.clamp(currentCursor.x * MAX_ROT, -MAX_ROT, MAX_ROT);
    const targetRotX = THREE.MathUtils.clamp(currentCursor.y * MAX_ROT * 0.7, -MAX_ROT * 0.7, MAX_ROT * 0.7);

    const landingBasePitch = -THREE.MathUtils.degToRad(16);
    const landingTiltY = THREE.MathUtils.clamp(currentCursor.x * THREE.MathUtils.degToRad(8), -0.14, 0.14);
    const landingTiltX = THREE.MathUtils.clamp(-currentCursor.y * THREE.MathUtils.degToRad(6), -0.11, 0.11);
    const landingRotX = landingBasePitch + landingTiltX;
    const landingParallaxX = currentCursor.x * 0.18;
    const landingParallaxY = -currentCursor.y * 0.08;

    let loginRotX = 0;
    if (!introStarted) {
      loginRotX = Math.PI / 4;
    } else {
      if (introProgress < 1) {
        introProgress = Math.min(1, introProgress + 0.72 * dt);
      }
      const eased = 1 - Math.pow(1 - introProgress, 4);
      const startX = Math.PI / 4;
      loginRotX = startX + (targetRotX - startX) * eased;
    }

    if (!isPerfMode && viewBlend < 0.999) {
      landingSpinZ -= 0.21 * dt;
      if (landingSpinZ < -Math.PI * 2) landingSpinZ += Math.PI * 2;
    }

    _qSpin.setFromAxisAngle(_zAxis, landingSpinZ);
    _landingQuat.copy(_qSpin).multiply(jpcsCounterQuat);

    if (jpcsLandingPivot) {
      if (viewBlend <= 0.001) {
        jpcsLandingPivot.quaternion.copy(_landingQuat);
      } else if (viewBlend >= 0.999) {
        jpcsLandingPivot.quaternion.copy(identityQuat);
      } else {
        jpcsLandingPivot.quaternion.slerpQuaternions(_landingQuat, identityQuat, viewBlend);
      }
    }

    if (jpcsWrapper) {
      const targetX = THREE.MathUtils.lerp(landingParallaxX, -loginXOffset, viewBlend);
      const targetY = THREE.MathUtils.lerp(landingPosY + landingParallaxY, 0, viewBlend);
      jpcsWrapper.position.set(targetX, targetY, 0);

      const targetScaleVal = THREE.MathUtils.lerp(
        landingScaleJPCS / jpcsMaxDim,
        LOGIN_SCALE_JPCS / jpcsMaxDim,
        viewBlend
      );
      jpcsWrapper.scale.setScalar(targetScaleVal);

      const curRotX = THREE.MathUtils.lerp(landingRotX, loginRotX, viewBlend);
      const curRotY = THREE.MathUtils.lerp(landingTiltY, targetRotY, viewBlend);
      jpcsWrapper.rotation.set(curRotX, curRotY, 0);
    }

    if (bsuWrapper) {
      const targetX = THREE.MathUtils.lerp(12.0, loginXOffset, viewBlend);
      const targetY = THREE.MathUtils.lerp(-0.8, 0, viewBlend);
      bsuWrapper.position.set(targetX, targetY, 0);

      const targetScaleVal = THREE.MathUtils.lerp(
        0.001,
        LOGIN_SCALE_BSU / bsuMaxDim,
        viewBlend
      );
      bsuWrapper.scale.setScalar(targetScaleVal);
      bsuWrapper.visible = viewBlend > 0.01;
      bsuWrapper.rotation.set(loginRotX, targetRotY, 0);
    }

    if (lowMode) {
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
    window.removeEventListener('resize', updateDimensions);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('pondosync-perf-change', onPerfChange);
    window.removeEventListener('pondo-view-login', onViewToLogin);
    window.removeEventListener('pondo-coin-exit', onViewToLogin);
    window.removeEventListener('pondo-view-landing', onViewToLanding);
    window.removeEventListener('pondo-coin-enter', onViewToLanding);

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
    shadowGeo.dispose();
    shadowMat.dispose();
    reflGeo.dispose();
    reflMat.dispose();
    composer.dispose();
    renderer.dispose();
  }

  window.addEventListener('pagehide', disposeScene, { once: true });

  rafId = requestAnimationFrame(animate);
})();
