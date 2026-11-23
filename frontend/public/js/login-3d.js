/**
 * PondoSync — 3D Background & Landing Centerpiece
 * 
 * - Landing View: Features the 3D JPCS logo as the primary centerpiece,
 *   centered at the bottom, rotating 360° around the vertical Y-axis (turntable)
 *   with warm golden illumination.
 * - Login View: Displays BOTH 3D logos (JPCS on left, BSU on right) flanking
 *   the login card, with cursor-driven interaction, soft shadows, and reflective ground.
 * - Smooth cinematic lerp transitions between Landing and Login screens.
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

  let isPerfMode = Boolean(window.PondoSyncPerf && window.PondoSyncPerf.isEnabled());

  /* ========================================================
     RENDERER
     ======================================================== */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: !isPerfMode,
    powerPreference: isPerfMode ? 'default' : 'high-performance'
  });
  renderer.setPixelRatio(isPerfMode ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.65;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = !isPerfMode;
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
  envScene.add(new THREE.Mesh(
    new THREE.SphereGeometry(5, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x0c0a10, side: THREE.BackSide })
  ));
  const envPt = new THREE.PointLight(0xdaa555, 0.4, 10);
  envPt.position.set(2, 2, 0);
  envScene.add(envPt);

  const envMap = pmrem.fromScene(envScene, 0, 0.1, 100).texture;
  scene.environment = envMap;
  pmrem.dispose();

  /* ========================================================
     LIGHTING — Balanced cinematic gold lighting
     ======================================================== */

  // Ambient: warm dim fill
  const ambientLight = new THREE.AmbientLight(0x221a16, 0.7);
  scene.add(ambientLight);

  // Left Key Light (JPCS in login position)
  const keyLightLeft = new THREE.SpotLight(0xdaa555, 2.0, 32, Math.PI / 3, 0.8, 1.8);
  keyLightLeft.position.set(-6, 4, 5);
  keyLightLeft.target.position.set(-4.8, 0, 0);
  keyLightLeft.castShadow = true;
  keyLightLeft.shadow.mapSize.set(1024, 1024);
  keyLightLeft.shadow.bias = -0.0004;
  keyLightLeft.shadow.radius = 6;
  scene.add(keyLightLeft);
  scene.add(keyLightLeft.target);

  // Right Key Light (BSU in login position)
  const keyLightRight = new THREE.SpotLight(0xdaa555, 2.0, 32, Math.PI / 3, 0.8, 1.8);
  keyLightRight.position.set(6, 4, 5);
  keyLightRight.target.position.set(4.8, 0, 0);
  keyLightRight.castShadow = true;
  keyLightRight.shadow.mapSize.set(1024, 1024);
  keyLightRight.shadow.bias = -0.0004;
  keyLightRight.shadow.radius = 6;
  scene.add(keyLightRight);
  scene.add(keyLightRight.target);

  // Center Key Spotlight (illuminates JPCS on Landing page)
  const centerKeyLight = new THREE.SpotLight(0xf5d080, 2.8, 30, Math.PI / 3, 0.6, 1.5);
  centerKeyLight.position.set(0, 3.5, 6);
  centerKeyLight.target.position.set(0, -1.8, 0);
  centerKeyLight.castShadow = true;
  centerKeyLight.shadow.mapSize.set(1024, 1024);
  centerKeyLight.shadow.bias = -0.0004;
  scene.add(centerKeyLight);
  scene.add(centerKeyLight.target);

  // Center Top Rim Light (golden rim highlight for landing centerpiece)
  const centerRimLight = new THREE.PointLight(0xffe090, 1.8, 16, 2);
  centerRimLight.position.set(0, 3.2, 1.5);
  scene.add(centerRimLight);

  // Fill Light: soft overall warmth
  const fillLight = new THREE.DirectionalLight(0x8a7a6a, 0.4);
  fillLight.position.set(0, 2, 4);
  scene.add(fillLight);

  // Top Rim Light behind models
  const rimTop = new THREE.PointLight(0xd4af37, 0.8, 20, 2);
  rimTop.position.set(0, 3, -4);
  scene.add(rimTop);

  /* ========================================================
     GROUND PLANES (Shadow & Reflection)
     ======================================================== */
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 8),
    new THREE.ShadowMaterial({ opacity: 0.28, color: 0x000000 })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = -1.7;
  shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);

  const reflectionPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 8),
    new THREE.MeshStandardMaterial({
      color: 0x0c0a10,
      metalness: 0.95,
      roughness: 0.6,
      transparent: true,
      opacity: 0.12,
      envMap: envMap,
      envMapIntensity: 0.4
    })
  );
  reflectionPlane.rotation.x = -Math.PI / 2;
  reflectionPlane.position.y = -1.69;
  reflectionPlane.receiveShadow = true;
  scene.add(reflectionPlane);

  /* ========================================================
     POST-PROCESSING — Bloom Glow
     ======================================================== */
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    0.42,   // strength
    1.1,    // radius
    0.65    // threshold
  );
  bloomPass.enabled = !isPerfMode;
  composer.addPass(bloomPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  /* ========================================================
     MODEL LOADING (JPCS & BSU logos)
     ======================================================== */
  let jpcsWrapper = null;
  let jpcsLandingPivot = null;
  let jpcsCounterQuat = new THREE.Quaternion();
  let bsuWrapper = null;
  let jpcsMaxDim = 1;
  let bsuMaxDim = 1;

  // Sizing & position configuration
  const LOGIN_SCALE_JPCS = 3.8;
  const LOGIN_SCALE_BSU  = 4.2;

  let landingScaleJPCS = 4.8;
  let landingPosY = -1.8;
  let loginXOffset = 4.8;

  const loader = new GLTFLoader();
  let loadedCount = 0;

  function onModelsReady() {
    updateDimensions();
    window.dispatchEvent(new Event('3d-models-loaded'));
  }

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

  // 1. Load JPCS Logo (untouched raw model for login, landing pivot for flat spin on landing)
  loader.load(
    'assets/3d models/JPCS logo.glb',
    (gltf) => {
      const model = gltf.scene;

      // Center pivot exactly as in original login code (do NOT reset child nodes!)
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);

      // Find the child node's baked quaternion so we can counter-tilt ONLY on landing
      model.traverse((child) => {
        if (child.isMesh && child.parent) {
          jpcsCounterQuat.copy(child.quaternion).invert();
        }
      });

      // jpcsLandingPivot: handles flat orientation & front-face spin on landing ONLY.
      // On login, its quaternion is pure identity (0 effect).
      jpcsLandingPivot = new THREE.Group();
      jpcsLandingPivot.add(model);

      jpcsWrapper = new THREE.Group();
      jpcsWrapper.add(jpcsLandingPivot);

      const size = box.getSize(new THREE.Vector3());
      jpcsMaxDim = Math.max(size.x, size.y, size.z) || 1;

      setupModelMaterials(model);

      // Start at landing position
      jpcsWrapper.position.set(0, landingPosY, 0);
      jpcsWrapper.scale.setScalar(landingScaleJPCS / jpcsMaxDim);

      scene.add(jpcsWrapper);

      loadedCount++;
      if (loadedCount === 2) onModelsReady();
    },
    undefined,
    (err) => {
      console.warn('[login-3d] Error loading JPCS logo:', err);
      loadedCount++;
      if (loadedCount === 2) onModelsReady();
    }
  );

  // 2. Load BSU Logo (untouched raw model for login)
  loader.load(
    'assets/3d models/BSU logo.glb',
    (gltf) => {
      const model = gltf.scene;

      // Center pivot exactly as in original login code
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);

      bsuWrapper = new THREE.Group();
      bsuWrapper.add(model);

      const size = box.getSize(new THREE.Vector3());
      bsuMaxDim = Math.max(size.x, size.y, size.z) || 1;

      setupModelMaterials(model);

      // Start off-screen
      bsuWrapper.position.set(12, 0, 0);
      bsuWrapper.scale.setScalar(LOGIN_SCALE_BSU / bsuMaxDim);
      bsuWrapper.visible = false;

      scene.add(bsuWrapper);

      loadedCount++;
      if (loadedCount === 2) onModelsReady();
    },
    undefined,
    (err) => {
      console.warn('[login-3d] Error loading BSU logo:', err);
      loadedCount++;
      if (loadedCount === 2) onModelsReady();
    }
  );

  /* ========================================================
     RESPONSIVE POSITIONING & SIZING
     ======================================================== */
  function updateDimensions() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloomPass.resolution.set(w, h);
    camera.aspect = w / h;

    // Adjust camera distance for screen aspect ratio
    if (camera.aspect < 1.5) {
      camera.position.z = 10;
    } else {
      camera.position.z = 8;
    }
    camera.updateProjectionMatrix();

    // Compute visible frustum at Z = 0
    const frustumH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const frustumW = frustumH * camera.aspect;

    // Responsive landing settings for JPCS centerpiece:
    // Balanced size with majestic curved horizon rising from bottom
    const landingDiam = Math.min(7.4, Math.max(4.8, frustumW * 0.60));
    landingScaleJPCS = landingDiam;

    // Position: Top rim of the coin sits nicely below the "Get Started" button
    // (~42% from the bottom of the screen), without covering the button or text.
    const topRimY = -(frustumH * 0.09);
    landingPosY = topRimY - (landingDiam / 2);

    // Responsive login offsets
    loginXOffset = Math.min(4.8, frustumW * 0.42);

    centerKeyLight.position.set(0, topRimY + 3.0, 5.5);
    centerKeyLight.target.position.set(0, topRimY - 0.5, 0);
    centerKeyLight.target.updateMatrixWorld();
    centerRimLight.position.set(0, topRimY + 0.6, 1.2);
  }

  window.addEventListener('resize', updateDimensions);

  /* ========================================================
     VIEW STATE & TRANSITIONS
     0 = Landing View (JPCS centerpiece at center-bottom, 360° spin)
     1 = Login View (JPCS on left, BSU on right, cursor tracking)
     ======================================================== */
  const isInitialLogin = window.location.hash === '#login';
  let targetViewBlend = isInitialLogin ? 1.0 : 0.0;
  let viewBlend = targetViewBlend;

  window.addEventListener('pondo-view-login', () => {
    targetViewBlend = 1.0;
  });
  window.addEventListener('pondo-coin-exit', () => {
    targetViewBlend = 1.0;
  });

  window.addEventListener('pondo-view-landing', () => {
    targetViewBlend = 0.0;
  });
  window.addEventListener('pondo-coin-enter', () => {
    targetViewBlend = 0.0;
  });

  /* ========================================================
     CURSOR TRACKING (Original login interactive tracking)
     ======================================================== */
  const cursor = { x: 0, y: 0 };
  const currentCursor = { x: 0, y: 0 };
  const MAX_ROT = THREE.MathUtils.degToRad(12);
  const LERP_FACTOR = 0.06;
  let introStarted = false;
  let introProgress = 0;

  window.addEventListener('3d-models-loaded', () => {
    setTimeout(() => { introStarted = true; }, 400);
  });

  window.addEventListener('mousemove', (e) => {
    cursor.x = (e.clientX / window.innerWidth) * 2 - 1;
    cursor.y = (e.clientY / window.innerHeight) * 2 - 1;
  });

  /* ========================================================
     PERFORMANCE MODE SYNC
     ======================================================== */
  function applyPerfMode(perf) {
    isPerfMode = perf;
    bloomPass.enabled = !perf;
    const dpr = perf ? 1 : Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(dpr);
    composer.setPixelRatio(dpr);
    renderer.shadowMap.autoUpdate = !perf;
    if (!perf) renderer.shadowMap.needsUpdate = true;
  }

  window.addEventListener('pondosync-perf-change', (e) => {
    applyPerfMode(e.detail.enabled);
  });

  /* ========================================================
     RENDER LOOP
     ======================================================== */
  let lastFrameTime = 0;
  const PERF_INTERVAL = 1000 / 30;
  let landingSpinZ = 0;
  const identityQuat = new THREE.Quaternion(); // Identity (0, 0, 0, 1)

  function animate(now) {
    requestAnimationFrame(animate);

    if (document.hidden) return;

    if (isPerfMode && now) {
      const elapsed = now - lastFrameTime;
      if (elapsed < PERF_INTERVAL) return;
      lastFrameTime = now - (elapsed % PERF_INTERVAL);
    }

    // ── Smooth view interpolation ──
    const dBlend = targetViewBlend - viewBlend;
    if (Math.abs(dBlend) > 0.001) {
      viewBlend += dBlend * 0.075;
    } else {
      viewBlend = targetViewBlend;
    }

    // ── Update lighting based on view blend ──
    centerKeyLight.intensity = THREE.MathUtils.lerp(2.8, 0.2, viewBlend);
    centerRimLight.intensity = THREE.MathUtils.lerp(1.8, 0.0, viewBlend);
    keyLightLeft.intensity   = THREE.MathUtils.lerp(0.8, 2.0, viewBlend);
    keyLightRight.intensity  = THREE.MathUtils.lerp(0.2, 2.0, viewBlend);

    shadowPlane.position.y     = THREE.MathUtils.lerp(-4.0, -1.7, viewBlend);
    reflectionPlane.position.y = THREE.MathUtils.lerp(-3.99, -1.69, viewBlend);

    // ── Cursor Tracking (both Landing tilt & Login pose) ──
    currentCursor.x += (cursor.x - currentCursor.x) * LERP_FACTOR;
    currentCursor.y += (cursor.y - currentCursor.y) * LERP_FACTOR;
    const targetRotY = THREE.MathUtils.clamp(currentCursor.x * MAX_ROT, -MAX_ROT, MAX_ROT);
    const targetRotX = THREE.MathUtils.clamp(currentCursor.y * MAX_ROT * 0.7, -MAX_ROT * 0.7, MAX_ROT * 0.7);

    // Landing cursor reaction: subtle interactive tilt and parallax following mouse
    // Upper part tilted slightly to the back so it looks more flat in perspective
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
      if (introProgress < 1) introProgress += 0.012;
      const eased = 1 - Math.pow(1 - introProgress, 4);
      const startX = Math.PI / 4;
      loginRotX = startX + (targetRotX - startX) * eased;
    }

    // ── Continuous 360° front face spin around Z-axis (Landing only) ──
    if (!isPerfMode) {
      landingSpinZ -= 0.0035; // Clockwise 360° spin of the front face
      if (landingSpinZ < -Math.PI * 2) landingSpinZ += Math.PI * 2;
    }

    // Compute landing flat rotation quaternion: counter-tilt baked angle + spin around Z
    const qSpin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), landingSpinZ);
    const landingQuat = qSpin.multiply(jpcsCounterQuat);

    // ── Apply Landing-only rotation to jpcsLandingPivot (identity on login) ──
    if (jpcsLandingPivot) {
      if (viewBlend <= 0.001) {
        // Pure landing: flat facing screen, 360° front face spin
        jpcsLandingPivot.quaternion.copy(landingQuat);
      } else if (viewBlend >= 0.999) {
        // Pure login: identity quaternion, 0 effect on original model orientation!
        jpcsLandingPivot.quaternion.copy(identityQuat);
      } else {
        // Smooth transition
        jpcsLandingPivot.quaternion.slerpQuaternions(landingQuat, identityQuat, viewBlend);
      }
    }

    // ── Update JPCS Wrapper (Cursor-reactive on landing, original login rotation on login) ──
    if (jpcsWrapper) {
      // Position interpolation with subtle landing parallax
      const targetX = THREE.MathUtils.lerp(landingParallaxX, -loginXOffset, viewBlend);
      const targetY = THREE.MathUtils.lerp(landingPosY + landingParallaxY, 0, viewBlend);
      jpcsWrapper.position.set(targetX, targetY, 0);

      // Scale interpolation
      const targetScaleVal = THREE.MathUtils.lerp(
        landingScaleJPCS / jpcsMaxDim,
        LOGIN_SCALE_JPCS / jpcsMaxDim,
        viewBlend
      );
      jpcsWrapper.scale.setScalar(targetScaleVal);

      // Wrapper rotation: reacts to cursor + tilted back on landing, exact original login rotation on login!
      const curRotX = THREE.MathUtils.lerp(landingRotX, loginRotX, viewBlend);
      const curRotY = THREE.MathUtils.lerp(landingTiltY, targetRotY, viewBlend);
      jpcsWrapper.rotation.set(curRotX, curRotY, 0);
    }

    // ── Update BSU Wrapper (Exact original login rotation) ──
    if (bsuWrapper) {
      // Position: slides from right into position (loginXOffset, 0, 0)
      const bsuStartX = 12.0;
      const targetX = THREE.MathUtils.lerp(bsuStartX, loginXOffset, viewBlend);
      const targetY = THREE.MathUtils.lerp(-0.8, 0, viewBlend);
      bsuWrapper.position.set(targetX, targetY, 0);

      // Scale: scales up from 0 to LOGIN_SCALE_BSU
      const targetScaleVal = THREE.MathUtils.lerp(
        0.001,
        LOGIN_SCALE_BSU / bsuMaxDim,
        viewBlend
      );
      bsuWrapper.scale.setScalar(targetScaleVal);

      // Visible only when transitioning or in login
      bsuWrapper.visible = viewBlend > 0.01;

      // Exact original login rotation
      bsuWrapper.rotation.set(loginRotX, targetRotY, 0);
    }

    // ── Render ──
    if (isPerfMode) {
      renderer.render(scene, camera);
    } else {
      composer.render();
    }
  }

  animate();
})();
