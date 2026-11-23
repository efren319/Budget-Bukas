/**
 * PondoSync — 3D Philippine 20-Peso Coin Centerpiece
 * Minimalist luxury rendering with coin directly facing the screen,
 * 360-degree face rotation around its normal, and clean transitions.
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
  renderer.toneMappingExposure = 0.72;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = !isPerfMode;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 1);

  /* ========================================================
     SCENE + CAMERA (Orthographic / Focused Perspective)
     ======================================================== */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 7.5);

  /* ========================================================
     DARK ENVIRONMENT MAP FOR SPECULAR METALLIC HIGHLIGHTS
     ======================================================== */
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(
    new THREE.SphereGeometry(5, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x0c0a10, side: THREE.BackSide })
  ));
  const envLight = new THREE.PointLight(0xdaa555, 0.45, 10);
  envLight.position.set(2, 2, 0);
  envScene.add(envLight);

  const envMap = pmrem.fromScene(envScene, 0, 0.1, 100).texture;
  scene.environment = envMap;
  pmrem.dispose();

  /* ========================================================
     LIGHTING — Directly Facing Illumination
     ======================================================== */
  scene.add(new THREE.AmbientLight(0x221a14, 0.85));

  // 1. Key Light: Warm golden spotlight from slightly in front and above
  const keyLight = new THREE.SpotLight(0xffd577, 4.8, 30, Math.PI / 2.2, 0.7, 1.4);
  keyLight.position.set(0, 3.5, 7.0);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.bias = -0.0004;
  scene.add(keyLight);

  // 2. Top Rim Light: Bright highlight on the upper circular rim
  const rimLightTop = new THREE.SpotLight(0xffdf88, 7.0, 25, Math.PI / 3, 0.5, 1.2);
  rimLightTop.position.set(0, 2.8, 2.5);
  scene.add(rimLightTop);

  // 3. Fill Light: Soft directional ambient fill from left
  const fillLight = new THREE.DirectionalLight(0xd4af37, 0.55);
  fillLight.position.set(-4, 0, 5);
  scene.add(fillLight);

  /* ========================================================
     POST-PROCESSING (UnrealBloomPass for Soft Golden Glow)
     ======================================================== */
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.42,   // strength
    1.1,    // radius
    0.60    // threshold
  );
  bloomPass.enabled = !isPerfMode;
  composer.addPass(bloomPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  /* ========================================================
     MODEL HIERARCHY
     coinWrapper (position Y & responsive scale)
       └── coinSpinGroup (rotates 360 degrees around Z axis)
             └── coinParallaxGroup (subtle cursor parallax)
                   └── coinMesh (aligned directly facing camera)
     ======================================================== */
  let coinWrapper = new THREE.Group();
  let coinSpinGroup = new THREE.Group();
  let coinParallaxGroup = new THREE.Group();

  coinSpinGroup.add(coinParallaxGroup);
  coinWrapper.add(coinSpinGroup);
  scene.add(coinWrapper);

  let modelMaxDim = 1;
  let baseY = -3.5;
  let exitY = -14.0;
  let currentY = -3.5;
  let targetY = -3.5;
  let coinDiameter = 6.2;
  const SPIN_SPEED = 0.0035; // Speed for 360-degree face rotation

  const loader = new GLTFLoader();

  loader.load(
    MODEL_PATH,
    (gltf) => {
      const model = gltf.scene;

      // Extract the mesh and enhance its materials
      let meshObj = null;
      model.traverse((child) => {
        if (child.isMesh) {
          meshObj = child;
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
        }
      });

      if (meshObj) {
        // Reset raw node transform from Blender
        meshObj.position.set(0, 0, 0);
        meshObj.scale.set(1, 1, 1);

        // Center geometry buffer so origin (0,0,0) is exactly at the coin disc center
        meshObj.geometry.computeBoundingBox();
        meshObj.geometry.center();

        // Exact rotation matrix to make face DIRECTLY face the camera (+Z)
        // and REPUBLIKA NG PILIPINAS upright (+Y):
        // Rotation: rx = -PI/2, ry = 0, rz = 0
        meshObj.rotation.set(-Math.PI / 2, 0, 0);

        // Compute size from centered geometry
        meshObj.geometry.computeBoundingBox();
        const bbox = meshObj.geometry.boundingBox;
        const size = bbox.getSize(new THREE.Vector3());
        // In this orientation, X and Y are the diameter (2.7088), Z is the thickness (0.13)
        modelMaxDim = Math.max(size.x, size.y) || 2.7;

        coinParallaxGroup.add(meshObj);
      } else {
        coinParallaxGroup.add(model);
      }

      updateDimensions();

      // If initial page state is login, immediately move coin to exit position
      if (window.location.hash === '#login') {
        currentY = exitY;
        targetY = exitY;
        coinWrapper.position.y = currentY;
        container.style.display = 'none';
        isRendering = false;
      }

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
    coinDiameter = Math.min(6.2, Math.max(3.8, frustumWidth * 0.88));
    coinWrapper.scale.setScalar(coinDiameter / modelMaxDim);

    // Position center so top rim reaches ~42% from viewport bottom:
    // topRimY = baseY + (coinDiameter / 2)
    // We want topRimY = - (frustumHeight / 2) + frustumHeight * 0.42
    baseY = - (frustumHeight / 2) + (frustumHeight * 0.42) - (coinDiameter / 2);
    exitY = - (frustumHeight / 2) - coinDiameter - 3;

    keyLight.target.position.set(0, baseY + (coinDiameter / 4), 0);
    rimLightTop.target.position.set(0, baseY + (coinDiameter / 2), 0);

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
    container.style.display = '';
    if (!isRendering) {
      isRendering = true;
      requestAnimationFrame(animate);
    }
  });

  window.addEventListener('pondo-coin-enter', () => {
    isTransitioning = true;
    isExited = false;
    targetY = baseY;
    container.style.display = '';
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
  let lastFrameTime = 0;
  const PERF_INTERVAL = 1000 / 30;

  function animate(now) {
    if (!isRendering) return;

    requestAnimationFrame(animate);

    // Pause when tab is hidden
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

    // 1. Vertical entry/exit animation
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
        // When fully exited on the login page: HIDE CONTAINER & STOP RENDERING!
        container.style.display = 'none';
        isRendering = false;
      } else {
        isExited = false;
        isTransitioning = false;
      }
    }

    // 2. 360-Degree Continuous Face Rotation (around Z normal axis)
    // The coin face stays directly facing the screen while spinning 360 degrees
    if (!isPerfMode) {
      coinSpinGroup.rotation.z = (coinSpinGroup.rotation.z + SPIN_SPEED) % (Math.PI * 2);
    }

    // 3. Subtle cursor parallax tilt (kept very subtle so face stays directly facing screen)
    coinParallaxGroup.rotation.x = current.y * 0.035;
    coinParallaxGroup.rotation.y = current.x * 0.035;

    if (isPerfMode) {
      renderer.render(scene, camera);
    } else {
      composer.render();
    }
  }

  animate();
})();
