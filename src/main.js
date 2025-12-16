import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { GUI } from 'lil-gui';

// --- Налаштування сцени ---
const canvas = document.querySelector('#webgl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(30, 20, 40);

// --- HDR оточення ---
let pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

let originalEnvMap = null;

new RGBELoader()
  .load('/static/textures/hdr.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    originalEnvMap = pmremGenerator.fromEquirectangular(texture).texture;
    scene.background = originalEnvMap;
    scene.environment = originalEnvMap;
    texture.dispose();
  });

// --- Освітлення ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 4);
directionalLight.position.set(30, 50, 30);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
scene.add(directionalLight);

// --- Засніжена земля ---
const groundGeometry = new THREE.PlaneGeometry(200, 200);
const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.9,
  metalness: 0.0,
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// --- П'єдестал під монумент ---
const pedestalGeometry = new THREE.CylinderGeometry(12, 15, 4, 32);
const pedestalMaterial = new THREE.MeshStandardMaterial({
  color: 0xaaaaaa,
  roughness: 0.7,
  metalness: 0.1,
});
const pedestal = new THREE.Mesh(pedestalGeometry, pedestalMaterial);
pedestal.position.y = 2;
pedestal.receiveShadow = true;
pedestal.castShadow = true;
scene.add(pedestal);

// --- Завантаження основної моделі (монумент) ---
let model;
const gltfLoader = new GLTFLoader();
gltfLoader.load('/static/models/monum.glb', (gltf) => {
  model = gltf.scene;

  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  scene.add(model);

  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);

  const targetSize = 18;
  if (maxDim > 0) {
    const scaleFactor = targetSize / maxDim;
    model.scale.multiplyScalar(scaleFactor);
  }

  box.setFromObject(model);
  const center = new THREE.Vector3();
  box.getCenter(center);
  model.position.sub(center);
  model.position.y = 4;

  const viewDistance = targetSize * 2.5;
  camera.position.set(viewDistance, viewDistance * 0.7, viewDistance * 1.2);
  directionalLight.position.set(viewDistance * 0.8, viewDistance * 1.5, viewDistance);
  controls.target.set(0, targetSize * 0.4, 0);
  controls.update();
});

// --- Завантаження моделі ялинки та спавн 15 штук з перевіркою відстані ---
let treeModel;
gltfLoader.load('/static/models/tree.glb', (gltf) => {
  treeModel = gltf.scene;

  treeModel.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const box = new THREE.Box3().setFromObject(treeModel);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);

  const treeTargetSize = 15;
  let baseScale = 1;
  if (maxDim > 0) {
    baseScale = treeTargetSize / maxDim;
    treeModel.scale.multiplyScalar(baseScale);
  }

  box.setFromObject(treeModel);
  const center = new THREE.Vector3();
  box.getCenter(center);
  treeModel.position.sub(center);
  treeModel.position.y -= box.min.y;

  // Масив позицій вже розміщених ялинок
  const treePositions = [];

  const minDistance = 18; // мінімальна відстань між ялинками
  const maxAttempts = 100; // захист від нескінченного циклу

  let placedCount = 0;
  while (placedCount < 15) {
    let placed = false;
    let attempts = 0;

    while (!placed && attempts < maxAttempts) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 25 + Math.random() * 35; // трохи більший радіус для 15 ялинок (25-60)
      const newX = Math.cos(angle) * radius;
      const newZ = Math.sin(angle) * radius;

      // Перевірка відстані до існуючих
      let tooClose = false;
      for (const pos of treePositions) {
        const dist = Math.sqrt((newX - pos.x) ** 2 + (newZ - pos.z) ** 2);
        if (dist < minDistance) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        const clone = treeModel.clone();
        clone.position.set(newX, 0, newZ);
        clone.rotation.y = Math.random() * Math.PI * 2;
        const randomScale = 0.8 + Math.random() * 0.5;
        clone.scale.multiplyScalar(randomScale);
        scene.add(clone);

        treePositions.push({ x: newX, z: newZ });
        placed = true;
        placedCount++;
      }
      attempts++;
    }

    if (!placed) {
      console.warn(`Не вдалося розмістити ялинку #${placedCount + 1} після ${maxAttempts} спроб`);
      break; // виходимо, щоб не зависнути
    }
  }

  console.log(`Успішно розміщено ${placedCount} ялинок`);
});

// --- Завантаження та розміщення одного гнома (gnome1.glb) на п'єдесталі ---
gltfLoader.load('/static/models/gnome1.glb', (gltf) => {
  let gnome = gltf.scene;

  gnome.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  // Автоматичне масштабування гнома
  const box = new THREE.Box3().setFromObject(gnome);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const gnomeTargetHeight = 3.5; // бажана висота гнома
  if (maxDim > 0) {
    gnome.scale.multiplyScalar(gnomeTargetHeight / maxDim);
  }

  // Центрування та розміщення на поверхні п'єдесталу
  box.setFromObject(gnome);
  const center = box.getCenter(new THREE.Vector3());
  gnome.position.sub(center);                    // центруємо по X/Z
  gnome.position.y = 5.15 ;               // стоїть на п'єдесталі (Y = 4 + його власна висота)

  // Позиція на п'єдесталі (можеш змінити)
  gnome.position.x = 8;   // трохи праворуч від центру
  gnome.position.z = 5;   // по центру по Z
  // Рандомний або фіксований поворот (можеш прибрати рандом)
  gnome.rotation.y = Math.random() * Math.PI * 2;

  scene.add(gnome)
}, undefined, (err) => {
  console.error('Помилка завантаження gnome1.glb:', err);
});

// --- Система частинок: сніг ---
const snowCount = 12000;
const snowPositions = new Float32Array(snowCount * 3);
for (let i = 0; i < snowCount * 3; i += 3) {
  snowPositions[i]     = (Math.random() - 0.5) * 120;
  snowPositions[i + 1] = Math.random() * 80;
  snowPositions[i + 2] = (Math.random() - 0.5) * 120;
}

const snowGeometry = new THREE.BufferGeometry();
snowGeometry.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));

const snowMaterial = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 0.2,
  transparent: true,
  opacity: 0.8,
  depthWrite: false,
});

const snow = new THREE.Points(snowGeometry, snowMaterial);
scene.add(snow);

// --- Керування камерою ---
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// --- Параметри для День/Ніч ---
const params = {
  isNight: false,
  fogDensity: 0.002
};

// Початковий туман (день)
scene.fog = new THREE.FogExp2(0xd0e0f0, params.fogDensity);

// --- Debug UI ---
const gui = new GUI();

gui.add(params, 'isNight').name('Ніч').onChange(value => {
  if (value) {
    scene.fog = new THREE.FogExp2(0x000022, 0.004);
    scene.background = new THREE.Color(0x000011);
    scene.environment = null;
    directionalLight.intensity = 1;
    directionalLight.color.set(0xaaaaFF);
    ambientLight.intensity = 0.2;
  } else {
    scene.fog = new THREE.FogExp2(0xd0e0f0, params.fogDensity);
    if (originalEnvMap) {
      scene.background = originalEnvMap;
      scene.environment = originalEnvMap;
    }
    directionalLight.intensity = 4;
    directionalLight.color.set(0xffffff);
    ambientLight.intensity = 0.6;
  }
});

gui.add(params, 'fogDensity', 0, 0.01, 0.0001).name('Густина туману (день)').onChange(val => {
  if (!params.isNight) {
    scene.fog.density = val;
  }
});

gui.add(renderer, 'toneMappingExposure', 0.5, 2, 0.1).name('Exposure');
gui.add(directionalLight, 'intensity', 0, 10).name('Світло');
gui.add(snowMaterial, 'size', 0.05, 0.4).name('Розмір сніжинок');
gui.add(snowMaterial, 'opacity', 0, 1).name('Інтенсивність снігу');
gui.add(controls, 'autoRotate').name('Автообертання');

// --- Анімація (з вітром для снігу) ---
const clock = new THREE.Clock();

function animate() {
  const elapsedTime = clock.getElapsedTime();

  const pos = snowGeometry.attributes.position.array;
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] += Math.sin(elapsedTime * 0.5 + pos[i + 2]) * 0.02;
    pos[i + 2] += Math.cos(elapsedTime * 0.5 + pos[i]) * 0.02;
    pos[i + 1] -= 0.08;
    if (pos[i + 1] < 0) pos[i + 1] = 80;
  }
  snowGeometry.attributes.position.needsUpdate = true;

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

// --- Resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});