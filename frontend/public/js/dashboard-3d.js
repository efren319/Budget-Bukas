/**
 * PondoSync Dashboard — 3D Background Model
 * Cinematic rendering with strong bloom glow, soft shadows,
 * and cursor-driven rotation for the 20 Pesos coin.
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
  if (window.innerWidth < MQ_MIN) return;

  /* ========================================================
     CONFIGURATION
     ======================================================== */
  const MODEL_CONFIG = {
    path: 'assets/3d models/20 pesos.glb',
    xOffset: 4.5,  // Moved in slightly
    yOffset: -0.5,
    zOffset: -2,   // Slightly closer
    scale: 7.5     // Slightly larger
  };

  const MAX_ROT_DEG = 10;
  const MAX_ROT = THREE.MathUtils.degToRad(MAX_ROT_DEG);
  const LERP_FACTOR = 0.05;

  /* ========================================================
     CANVAS + RENDERER
     ======================================================== */
  const canvas = document.getElementById('dashboard-3d-canvas');
  if (!canvas) return;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.55;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  renderer.setClearColor(0x000000, 1);

  /* ========================================================
     SCENE + CAMERA
     ======================================================== */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 9); // Slightly closer camera

  /* ========================================================
     ENVIRONMENT MAP
     ======================================================== */
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(
    new THREE.SphereGeometry(5, 32, 16),
    new THREE.MeshBasicMaterial({
      color: 0x0c0a10,
      side: THREE.BackSide
    })
  ));
  const envLight = new THREE.PointLight(0xdaa555, 0.3, 10);
  envLight.position.set(2, 2, 0);
  envScene.add(envLight);

  const envMap = pmrem.fromScene(envScene, 0, 0.1, 100).texture;
  scene.environment = envMap;
  pmrem.dispose();

  /* ========================================================
     LIGHTING
     ======================================================== */
  scene.add(new THREE.AmbientLight(0x1e1822, 0.5));

  const keyLight = new THREE.SpotLight(0xdaa555, 4.5, 60, Math.PI / 2.5, 0.9, 1.8);
  keyLight.position.set(12, 4, 12);
  keyLight.target.position.set(MODEL_CONFIG.xOffset, MODEL_CONFIG.yOffset, MODEL_CONFIG.zOffset);
  keyLight.castShadow = true;
  scene.add(keyLight);
  scene.add(keyLight.target);

  const fillLight = new THREE.DirectionalLight(0x8a7a6a, 0.3);
  fillLight.position.set(-5, 2, 4);
  scene.add(fillLight);

  const rimLight = new THREE.PointLight(0xd4af37, 0.7, 20, 2);
  rimLight.position.set(5, 3, -5);
  scene.add(rimLight);

  /* ========================================================
     POST-PROCESSING
     ======================================================== */
  const container = canvas.parentElement;
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    0.4,   // strength
    1.2,   // radius
    0.6    // threshold
  );
  composer.addPass(bloomPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  /* ========================================================
     LOAD MODEL
     ======================================================== */
  let modelWrapper = null;
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
      const maxDim = Math.max(size.x, size.y, size.z);
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
          mat.envMapIntensity = 1.3; // Much stronger reflection
          if (mat.emissive && mat.emissiveIntensity !== undefined) {
            mat.emissiveIntensity = Math.max(mat.emissiveIntensity * 1.5, 0.8);
          }
          mat.needsUpdate = true;
        }
      });

      scene.add(modelWrapper);
    },
    undefined,
    (err) => console.warn(`[dashboard-3d] Model load error:`, err)
  );

  /* ========================================================
     CURSOR TRACKING
     ======================================================== */
  const cursor = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };

  window.addEventListener('mousemove', (e) => {
    cursor.x = (e.clientX / window.innerWidth) * 2 - 1;
    cursor.y = (e.clientY / window.innerHeight) * 2 - 1;
  });

  /* ========================================================
     RESIZE HANDLER
     ======================================================== */
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloomPass.resolution.set(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  resize();
  window.addEventListener('resize', resize);

  /* ========================================================
     RENDER LOOP
     ======================================================== */
  function animate() {
    requestAnimationFrame(animate);

    current.x += (cursor.x - current.x) * LERP_FACTOR;
    current.y += (cursor.y - current.y) * LERP_FACTOR;

    if (modelWrapper) {
      // Smooth oscillation between -45 and +45 degrees (PI/4)
      const oscillation = Math.sin(Date.now() * 0.0006) * (Math.PI / 12);

      modelWrapper.rotation.y = (current.x * MAX_ROT) + oscillation;
      modelWrapper.rotation.x = THREE.MathUtils.clamp(current.y * MAX_ROT * 0.1, -MAX_ROT * 0.1, MAX_ROT * 0.1);
    }

    composer.render();
  }

  animate();
})();
