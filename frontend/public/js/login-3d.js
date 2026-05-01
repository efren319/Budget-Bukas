/**
 * PondoSync Login — 3D Background Logo
 * Cinematic rendering with strong bloom glow, soft shadows,
 * reflective ground plane, and cursor-driven rotation.
 */

import * as THREE from 'three';
import { GLTFLoader }      from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';

(function () {
  'use strict';

  /* ---------- bail on small screens ---------- */
  const MQ_MIN = 900;
  if (window.innerWidth < MQ_MIN) {
     window.dispatchEvent(new Event('3d-models-loaded'));
     return;
  }

  /* ========================================================
     CONFIGURATION
     ======================================================== */
  const MODELS = [
    {
      path: 'assets/3d models/JPCS logo.glb',
      xOffset: -4.8, // Further left
      scale: 3.8    // Bigger
    },
    {
      path: 'assets/3d models/BSU logo.glb',
      xOffset: 4.8,  // Further right
      scale: 4.2    // Bigger
    }
  ];
  
  const MAX_ROT_DEG    = 12;
  const MAX_ROT        = THREE.MathUtils.degToRad(MAX_ROT_DEG);
  const LERP_FACTOR    = 0.06;
  const MODEL_Y_OFFSET = 0;

  /* ========================================================
     CANVAS + RENDERER
     ======================================================== */
  const canvas = document.getElementById('login-3d-canvas');
  if (!canvas) {
     window.dispatchEvent(new Event('3d-models-loaded'));
     return;
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true, // Will be overridden by composer, but we use mix-blend-mode in CSS
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.6;           // cinematic darkness
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  // Set clear color to pure black, we will use mix-blend-mode: screen in CSS to make it transparent
  renderer.setClearColor(0x000000, 1);

  /* ========================================================
     SCENE + CAMERA
     ======================================================== */
  const scene  = new THREE.Scene();
  // Adjust camera to see wider field for both logos
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 8); // Moved back slightly to fit larger logos

  /* ========================================================
     DARK ENVIRONMENT MAP
     Provides subtle reflections without brightening the scene.
     ======================================================== */
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  // Procedural dark environment — a dim warm-tinted sphere
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(
    new THREE.SphereGeometry(5, 32, 16),
    new THREE.MeshBasicMaterial({
      color: 0x0c0a10,
      side: THREE.BackSide
    })
  ));
  // Add a tiny warm light inside to create a subtle gradient
  const envLight = new THREE.PointLight(0xdaa555, 0.3, 10);
  envLight.position.set(2, 2, 0);
  envScene.add(envLight);

  const envMap = pmrem.fromScene(envScene, 0, 0.1, 100).texture;
  scene.environment = envMap;
  pmrem.dispose();

  /* ========================================================
     LIGHTING — balanced cinematic
     Reduced intensity, even spread, no harsh contrast.
     ======================================================== */

  /* --- Ambient: dim warm fill --- */
  scene.add(new THREE.AmbientLight(0x1e1822, 0.6));

  /* --- Key lights: softer angled spot, warm gold --- */
  const keyLightRight = new THREE.SpotLight(
    0xdaa555, 2.0, 30, Math.PI / 3, 0.8, 1.8
  );
  keyLightRight.position.set(6, 4, 5);
  keyLightRight.target.position.set(4.8, 0, 0);
  keyLightRight.castShadow = true;
  keyLightRight.shadow.mapSize.set(1024, 1024);
  keyLightRight.shadow.bias = -0.0004;
  keyLightRight.shadow.radius = 6;
  scene.add(keyLightRight);
  scene.add(keyLightRight.target);

  const keyLightLeft = new THREE.SpotLight(
    0xdaa555, 2.0, 30, Math.PI / 3, 0.8, 1.8
  );
  keyLightLeft.position.set(-6, 4, 5);
  keyLightLeft.target.position.set(-4.8, 0, 0);
  keyLightLeft.castShadow = true;
  keyLightLeft.shadow.mapSize.set(1024, 1024);
  keyLightLeft.shadow.bias = -0.0004;
  keyLightLeft.shadow.radius = 6;
  scene.add(keyLightLeft);
  scene.add(keyLightLeft.target);

  /* --- Fill light: gentle opposite side --- */
  const fillLight = new THREE.DirectionalLight(0x8a7a6a, 0.4);
  fillLight.position.set(0, 2, 4);
  scene.add(fillLight);

  /* --- Rim lights: subtle gold edge --- */
  const rimTop = new THREE.PointLight(0xd4af37, 0.8, 20, 2);
  rimTop.position.set(0, 3, -4);
  scene.add(rimTop);

  /* ========================================================
     SHADOW-CATCHING GROUND PLANE
     Gives the model a grounded, physically-placed feel.
     ======================================================== */
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 8),
    new THREE.ShadowMaterial({ opacity: 0.25, color: 0x000000 })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = -1.7;
  shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);

  /* ========================================================
     REFLECTIVE FLOOR (very subtle)
     Low-opacity mirror plane under the model for grounding.
     ======================================================== */
  const reflectionPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 8),
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
  reflectionPlane.position.y = -1.69;            // just above shadow plane
  reflectionPlane.receiveShadow = true;
  scene.add(reflectionPlane);

  /* ========================================================
     POST-PROCESSING — Bloom (emission glow)
     ======================================================== */
  const container = canvas.parentElement;

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Bloom: Lowered strength so it doesn't wash out the models
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    0.45,     // strength — reduced significantly to prevent wash-out
    1.1,      // radius — increased spread for a bigger, softer glow
    0.65      // threshold — only emissive/bright areas bloom
  );
  composer.addPass(bloomPass);

  // OutputPass handles color space conversion after bloom
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  /* ========================================================
     LOAD MODELS
     ======================================================== */
  const loadedModels = [];
  const loader = new GLTFLoader();
  
  let loadedCount = 0;
  const checkFinished = () => {
    loadedCount++;
    if (loadedCount === MODELS.length) {
      window.dispatchEvent(new Event('3d-models-loaded'));
    }
  };

  MODELS.forEach((config) => {
    loader.load(
      config.path,
      (gltf) => {
        const model = gltf.scene;

        /* centre pivot */
        const box    = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);

        /* wrap in a container for easier positioning */
        const wrapper = new THREE.Group();
        wrapper.add(model);

        /* scale to desired size */
        const size   = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        wrapper.scale.setScalar(config.scale / maxDim);

        wrapper.position.x = config.xOffset;
        wrapper.position.y = MODEL_Y_OFFSET;

        /* enhance materials for cinematic response */
        model.traverse((child) => {
          if (!child.isMesh) return;

          child.castShadow = true;
          child.receiveShadow = true;

          const mat = child.material;
          if (!mat) return;

          /* subtle metallic + reflection boost */
          if (mat.metalness !== undefined) {
            mat.metalness = Math.min(mat.metalness + 0.1, 0.9);
          }
          if (mat.roughness !== undefined) {
            mat.roughness = Math.max(mat.roughness - 0.05, 0.25);
          }

          /* environment reflection — boosted for bigger specular highlights */
          mat.envMap = envMap;
          mat.envMapIntensity = 0.65;

          /* Subtle emission boost for bloom to catch */
          if (mat.emissive && mat.emissiveIntensity !== undefined) {
            mat.emissiveIntensity = Math.max(mat.emissiveIntensity * 1.2, 0.5);
          }

          mat.needsUpdate = true;
        });

        scene.add(wrapper);
        loadedModels.push(wrapper);
        checkFinished();
      },
      undefined,
      (err) => {
        console.warn(`[login-3d] Model load error (${config.path}):`, err);
        checkFinished();
      }
    );
  });

  /* ========================================================
     CURSOR TRACKING
     ======================================================== */
  const cursor  = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  let introStarted = false;
  let introProgress = 0;

  window.addEventListener('3d-models-loaded', () => {
    // Start the cinematic intro animation
    setTimeout(() => { introStarted = true; }, 400);
  });

  window.addEventListener('mousemove', (e) => {
    cursor.x = (e.clientX / window.innerWidth)  * 2 - 1;
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
    
    // Adjust camera position based on aspect ratio to keep both logos in view
    if (camera.aspect < 1.5) {
      camera.position.z = 10; // Move back on narrower screens
    } else {
      camera.position.z = 8;
    }
    
    camera.updateProjectionMatrix();
  }

  resize();
  window.addEventListener('resize', () => {
    if (window.innerWidth < MQ_MIN) {
      container.style.display = 'none';
      return;
    }
    container.style.display = '';
    resize();
  });

  /* ========================================================
     RENDER LOOP — uses composer (bloom pipeline)
     ======================================================== */
  function animate() {
    requestAnimationFrame(animate);

    current.x += (cursor.x - current.x) * LERP_FACTOR;
    current.y += (cursor.y - current.y) * LERP_FACTOR;

    loadedModels.forEach(model => {
      const targetRotY = THREE.MathUtils.clamp(current.x * MAX_ROT, -MAX_ROT, MAX_ROT);
      const targetRotX = THREE.MathUtils.clamp(current.y * MAX_ROT * 0.7, -MAX_ROT * 0.7, MAX_ROT * 0.7);

      if (!introStarted) {
        // Initial cinematic pose: looking down
        model.rotation.x = Math.PI / 4; 
        model.rotation.y = targetRotY;
      } else {
        // Smoothly animate from 45deg down to active rotation
        if (introProgress < 1) introProgress += 0.012; // Adjusted speed for luxury feel
        
        const eased = 1 - Math.pow(1 - introProgress, 4); // Quartic ease-out
        const startX = Math.PI / 4;
        
        model.rotation.x = startX + (targetRotX - startX) * eased;
        model.rotation.y = targetRotY;
      }
    });

    // Render through bloom composer
    composer.render();
  }

  animate();
})();
