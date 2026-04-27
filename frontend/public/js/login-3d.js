/**
 * PondoSync Login — 3D Background Logos
 * HDRI environment, soft studio lighting, dual models.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

(function () {
  'use strict';

  const MQ_MIN = 900;
  if (window.innerWidth < MQ_MIN) return;

  const BSU_MODEL_PATH = 'assets/3d models/BSU logo.glb';
  const JPCS_MODEL_PATH = 'assets/3d models/JPCS logo.glb';
  const HDRI_PATH = 'assets/3d models/studio.hdr';

  const MAX_ROT_DEG = 12;
  const MAX_ROT = THREE.MathUtils.degToRad(MAX_ROT_DEG);
  const LERP_FACTOR = 0.06;
  const MODEL_SCALE = 2.6; // Increased scale for larger logos

  const canvas = document.getElementById('login-3d-canvas');
  if (!canvas) return;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
    premultipliedAlpha: true
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.7; 
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 7); // slightly further back to see both

  /* --- HDRI Environment --- */
  new RGBELoader().load(HDRI_PATH, (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
  });

  /* --- Lighting (Cinematic Studio) --- */
  scene.add(new THREE.AmbientLight(0xffffff, 0.02)); // Extremely low ambient

  const keyLight = new THREE.SpotLight(0xfff5e6, 3.5, 40, Math.PI / 4, 0.5, 1.2);
  keyLight.position.set(5, 5, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.radius = 8;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xe6f0ff, 0.1); // Weak fill light
  fillLight.position.set(-5, 0, 5);
  scene.add(fillLight);

  const rimLight = new THREE.PointLight(0xffffff, 3.0, 20, 2); // Strong rim light for edge definition
  rimLight.position.set(0, 3, -5);
  scene.add(rimLight);

  /* --- Shadow/Reflection Plane --- */
  const groundGroup = new THREE.Group();
  groundGroup.position.y = -1.6;

  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 10),
    new THREE.ShadowMaterial({ opacity: 0.25, color: 0x000000 })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.receiveShadow = true;
  groundGroup.add(shadowPlane);
  scene.add(groundGroup);

  /* --- Compositor --- */
  const container = canvas.parentElement;
  const rtParams = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType
  };
  const renderTarget = new THREE.WebGLRenderTarget(container.clientWidth, container.clientHeight, rtParams);
  const composer = new EffectComposer(renderer, renderTarget);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const renderPass = new RenderPass(scene, camera);
  renderPass.clearColor = new THREE.Color(0x000000);
  renderPass.clearAlpha = 0;
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    1.5,     // strength - increased for intense glowing reflections
    0.5,     // radius
    0.6      // threshold - lowered so metallic reflections catch the bloom easily
  );

  bloomPass.compositeMaterial.blending = THREE.CustomBlending;
  bloomPass.compositeMaterial.blendEquation = THREE.AddEquation;
  bloomPass.compositeMaterial.blendSrc = THREE.OneFactor;
  bloomPass.compositeMaterial.blendDst = THREE.OneFactor;
  bloomPass.compositeMaterial.blendEquationAlpha = THREE.AddEquation;
  bloomPass.compositeMaterial.blendSrcAlpha = THREE.ZeroFactor;
  bloomPass.compositeMaterial.blendDstAlpha = THREE.OneFactor;
  composer.addPass(bloomPass);

  composer.addPass(new OutputPass());

  /* --- Noisy Blue Glow Shader --- */
  const glowUniforms = {
    time: { value: 0 }
  };

  const glowMaterial = new THREE.ShaderMaterial({
    uniforms: glowUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.AddEquation,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float time;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
                   mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float f = 0.0;
        f += 0.5000 * noise(p); p = p * 2.02;
        f += 0.2500 * noise(p); p = p * 2.03;
        f += 0.1250 * noise(p); p = p * 2.01;
        f += 0.0625 * noise(p);
        return f;
      }

      void main() {
        // Use noise to perturb the distance calculation for a non-perfect circle
        float n_shape = fbm(vUv * 1.5 + time * 0.1);
        float dist = distance(vUv + (n_shape - 0.5) * 0.15, vec2(0.5));
        
        float radial = smoothstep(0.45, 0.0, dist); // Revert to larger radius
        
        float n = fbm(vUv * 4.5 - time * 0.1); // Scattered but balanced
        
        // Lower overall intensity as requested
        float intensity = radial * (0.1 + 0.9 * n) * 1.1; 
        
        // Deep gold to glowing bright gold noise
        vec3 color = mix(vec3(0.5, 0.25, 0.05), vec3(0.85, 0.65, 0.3), n);
        
        gl_FragColor = vec4(color * intensity, intensity);
      }
    `
  });
  const glowGeometry = new THREE.PlaneGeometry(10, 10);

  /* --- Load Models --- */
  const models = [];
  const loader = new GLTFLoader();

  function processModel(model, posX, rotY) {
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);

    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    model.scale.setScalar(MODEL_SCALE / maxDim);
    model.rotation.y = rotY;

    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;

      const mat = child.material;
      if (!mat) return;

      mat.metalness = 1.0;
      mat.roughness = 0.15;
      mat.envMapIntensity = 0.8; // High reflection to catch the bloom

      if (mat.emissive && mat.emissiveIntensity !== undefined) {
        mat.emissiveIntensity = Math.max(mat.emissiveIntensity, 0.5);
      }
      mat.needsUpdate = true;
    });

    const wrapper = new THREE.Group();
    wrapper.add(model);

    // Add blue glow behind the model
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.z = -1.5; // push behind the model
    wrapper.add(glow);

    wrapper.position.x = posX;
    scene.add(wrapper);
    models.push(wrapper);
  }

  loader.load(JPCS_MODEL_PATH, (gltf) => {
    // Left side, slightly tilted right, pushed further out
    processModel(gltf.scene, -3.3, Math.PI / 8);
  });

  loader.load(BSU_MODEL_PATH, (gltf) => {
    // Right side, slightly tilted left, pushed further out
    processModel(gltf.scene, 3.3, -Math.PI / 8);
  });

  /* --- Cursor Tracking --- */
  const cursor = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };

  window.addEventListener('mousemove', (e) => {
    cursor.x = (e.clientX / window.innerWidth) * 2 - 1;
    cursor.y = (e.clientY / window.innerHeight) * 2 - 1;
  });

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
  window.addEventListener('resize', () => {
    if (window.innerWidth < MQ_MIN) {
      container.style.display = 'none';
      return;
    }
    container.style.display = '';
    resize();
  });

  function animate() {
    requestAnimationFrame(animate);

    glowUniforms.time.value = performance.now() * 0.001;

    current.x += (cursor.x - current.x) * LERP_FACTOR;
    current.y += (cursor.y - current.y) * LERP_FACTOR;

    models.forEach((m) => {
      m.rotation.y = THREE.MathUtils.clamp(current.x * MAX_ROT, -MAX_ROT, MAX_ROT);
      m.rotation.x = THREE.MathUtils.clamp(current.y * MAX_ROT * 0.7, -MAX_ROT * 0.7, MAX_ROT * 0.7);
    });

    composer.render();
  }

  animate();
})();
