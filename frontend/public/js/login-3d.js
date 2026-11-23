/**
 * PondoSync — 3D Philippine 20-Peso Coin Centerpiece
 * Minimalist luxury rendering with golden rim glow, soft bloom,
 * and smooth cinematic transitions between Landing and Login screens.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

(function () {
  'use strict';

  const MODEL_PATH = 'assets/3d models/20 pesos.glb';

  const canvas = document.getElementById('login-3d-canvas');
  if (!canvas) return;

  const container = canvas.parentElement || document.body;

  let isPerfMode = Boolean(window.PondoSyncPerf && window.PondoSyncPerf.isEnabled());

  /* ========================================================
     RENDERER SETUP
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
  camera.position.set(0, 0, 7.5);

  /* ========================================================
     DARK ENVIRONMENT MAP FOR SPECULAR REFLECTION
     ======================================================== */
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(
    new THREE.SphereGeometry(5, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x0c0a10, side: THREE.BackSide })
  ));
  const envLight = new THREE.PointLight(0xdaa555, 0.4, 10);
  envLight.position.set(2, 2, 0);
  envScene.add(envLight);

  const envMap = pmrem.fromScene(envScene, 0, 0.1, 100).texture;
  scene.environment = envMap;
  pmrem.dispose();

  /* ========================================================
     LIGHTING — Golden Rim & Surface Relief Highlights
     ======================================================== */
  scene.add(new THREE.AmbientLight(0x1a1410, 0.7));

  // 1. Top Rim Spotlight — produces the golden rim halo seen in reference image
  const rimLightTop = new THREE.SpotLight(0xffdf88, 7.5, 30, Math.PI / 3, 0.5, 1.2);
  rimLightTop.position.set(0, 3.5, -1.8);
  rimLightTop.target.position.set(0, 0, 0);
  scene.add(rimLightTop);
  scene.add(rimLightTop.target);

  // 2. Secondary Top Edge Light for soft glow
  const rimPoint = new THREE.PointLight(0xd4af37, 3.2, 16, 1.6);
  rimPoint.position.set(0, 2.0, -1.5);
  scene.add(rimPoint);

  // 3. Key Light — warm gold, lights up the embossed letters & sun on front face
  const keyLight = new THREE.SpotLight(0xdaa555, 4.2, 35, Math.PI / 2.5, 0.75, 1.8);
  keyLight.position.set(0, 4.5, 7.0);
  keyLight.target.position.set(0, -1.5, 0);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.bias = -0.0004;
  scene.add(keyLight);
  scene.add(keyLight.target);

  // 4. Fill Light — gentle opposite side illumination
  const fillLight = new THREE.DirectionalLight(0x8a7a6a, 0.45);
  fillLight.position.set(-5, 1, 5);
  scene.add(fillLight);

  /* ========================================================
     POST-PROCESSING (UnrealBloomPass for Golden Bloom)
     ======================================================== */
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.48,   // strength — rich gold glow on coin rim
    1.1,    // radius
    0.60    // threshold
  );
  bloomPass.enabled = !isPerfMode;
  composer.addPass(bloomPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  /* ========================================================
     MODEL LOADING (20 pesos.glb ONLY)
     ======================================================== */
  let coinWrapper = null;
  let modelMaxDim = 1;
  let baseY = -3.5;
  let exitY = -12.0;
  let currentY = -3.5;
  let targetY = -3.5;
  let coinDiameter = 6.6;

  const loader = new GLTFLoader();

  loader.load(
    MODEL_PATH,
    (gltf) => {
      const model = gltf.scene;

      // Center model pivot
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);

      coinWrapper = new THREE.Group();
      coinWrapper.add(model);

      const size = box.getSize(new THREE.Vector3());
      modelMaxDim = Math.max(size.x, size.y, size.z) || 1;

      // Enhance metallic materials
      model.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;

        const mat = child.material;
        if (mat) {
          if (mat.metalness !== undefined) mat.metalness = Math.min(mat.metalness + 0.15, 0.96);
          if (mat.roughness !== undefined) mat.roughness = Math.max(mat.roughness - 0.08, 0.22);
          mat.envMap = envMap;
          mat.envMapIntensity = 1.35;
          if (mat.emissive && mat.emissiveIntensity !== undefined) {
            mat.emissiveIntensity = Math.max(mat.emissiveIntensity * 1.3, 0.6);
          }
          mat.needsUpdate = true;
        }
      });

      // Subtle tilted-back angle so face looks up toward lights
      coinWrapper.rotation.x = Math.PI / 5.5; // ~32 deg tilt

      scene.add(coinWrapper);
      updateDimensions();

      window.dispatchEvent(new Event('3d-models-loaded'));
    },
    undefined,
    (err) => {
      console.warn('[login-3d] Error loading 20 pesos coin model:', err);
      window.dispatchEvent(new Event('3d-models-loaded'));
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
    camera.updateProjectionMatrix();

    if (!coinWrapper) return;

    // Calculate visible frustum dimensions at Z = 0
    const frustumHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const frustumWidth = frustumHeight * camera.aspect;

    // Responsive coin diameter:
    // Large centerpiece on desktop, fits comfortably on mobile
    coinDiameter = Math.min(6.8, Math.max(3.8, frustumWidth * 0.88));
    coinWrapper.scale.setScalar(coinDiameter / modelMaxDim);

    // Position center so top rim reaches ~45% from viewport bottom:
    // topRimY = baseY + (coinDiameter / 2)
    // We want topRimY = - (frustumHeight / 2) + frustumHeight * 0.44
    baseY = - (frustumHeight / 2) + (frustumHeight * 0.44) - (coinDiameter / 2);
    exitY = - (frustumHeight / 2) - coinDiameter - 2;

    if (!isExited && !isTransitioning) {
      currentY = baseY;
      targetY = baseY;
      coinWrapper.position.y = currentY;
    } else if (isExited && !isTransitioning) {
      currentY = exitY;
      targetY = exitY;
      coinWrapper.position.y = currentY;
    }
  }

  window.addEventListener('resize', updateDimensions);

  /* ========================================================
     CURSOR PARALLAX
     ======================================================== */
  const cursor = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };

  window.addEventListener('mousemove', (e) => {
    cursor.x = (e.clientX / window.innerWidth) * 2 - 1;
    cursor.y = (e.clientY / window.innerHeight) * 2 - 1;
  });

  /* ========================================================
     TRANSITION STATE HANDLING
     ======================================================== */
  let isExited = false;
  let isTransitioning = false;
  let isRendering = true;

  window.addEventListener('pondo-coin-exit', () => {
    isTransitioning = true;
    isExited = false;
    targetY = exitY;
    if (!isRendering) {
      isRendering = true;
      requestAnimationFrame(animate);
    }
  });

  window.addEventListener('pondo-coin-enter', () => {
    isTransitioning = true;
    isExited = false;
    targetY = baseY;
    if (!isRendering) {
      isRendering = true;
      requestAnimationFrame(animate);
    }
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
     ANIMATION & RENDER LOOP
     ======================================================== */
  const baseRotX = Math.PI / 5.5; // ~32 deg tilt
  let lastFrameTime = 0;
  const PERF_INTERVAL = 1000 / 30;

  function animate(now) {
    if (!isRendering) return;

    requestAnimationFrame(animate);

    // Pause when tab hidden
    if (document.hidden) return;

    // Frame rate throttle in performance mode
    if (isPerfMode && now) {
      const elapsed = now - lastFrameTime;
      if (elapsed < PERF_INTERVAL) return;
      lastFrameTime = now - (elapsed % PERF_INTERVAL);
    }

    // Cursor tracking lerp
    current.x += (cursor.x - current.x) * 0.05;
    current.y += (cursor.y - current.y) * 0.05;

    if (coinWrapper) {
      // Smooth vertical movement for login transition (down / up)
      const dy = targetY - currentY;
      if (Math.abs(dy) > 0.005) {
        currentY += dy * 0.085;
        coinWrapper.position.y = currentY;
      } else {
        currentY = targetY;
        coinWrapper.position.y = currentY;
        if (targetY === exitY) {
          isExited = true;
          isTransitioning = false;
          // When fully off-screen on the login page, stop rendering to save GPU/CPU!
          isRendering = false;
        } else {
          isExited = false;
          isTransitioning = false;
        }
      }

      // Natural subtle oscillation (paused in performance mode)
      const oscillation = isPerfMode ? 0 : Math.sin(Date.now() * 0.0007) * 0.22;

      // Cursor parallax and subtle rotation
      coinWrapper.rotation.y = (current.x * 0.15) + oscillation;
      coinWrapper.rotation.x = baseRotX + (current.y * 0.06);
    }

    if (isPerfMode) {
      renderer.render(scene, camera);
    } else {
      composer.render();
    }
  }

  animate();
})();
