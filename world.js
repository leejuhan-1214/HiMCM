import * as THREE from './three.module.min.js';
import { OrbitControls } from './OrbitControls.js';

/**
 * A procedural diorama, driven entirely by the population model in the caller.
 * This module does not advance ecology or compute population/pollination.
 * Rendered insects are deterministic representative samples, never 1:1 bees.
 * Coordinates: Y is up; one hive (-9,-2), flower fields (+5,+4)/(+5,-6).
 */
export function createWorld(container, { onSelect } = {}) {
  if (!container?.appendChild) throw new TypeError('A DOM container is required for the 3D world.');
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const number = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
  const mod = (n, d = 1) => ((n % d) + d) % d;
  let seed = 2022;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const range = (a, b) => a + random() * (b - a);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.13;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor('#e9eee7');
  renderer.domElement.className = 'bee-world-canvas';
  renderer.domElement.setAttribute('aria-label', '벌통 한 개와 꽃밭을 보여주는 3D 가상 환경. 드래그로 회전하고 스크롤로 확대합니다.');
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e9eee7');
  scene.fog = new THREE.Fog('#e9eee7', 68, 130);
  const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 180);
  camera.position.set(32, 29, 36);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.3, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 4.5;
  controls.maxDistance = 82;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minPolarAngle = 0.13;
  controls.enablePan = true;
  controls.panSpeed = 0.55;
  controls.zoomSpeed = 0.75;
  controls.rotateSpeed = 0.7;

  const ambient = new THREE.HemisphereLight('#fffbea', '#7d9079', 2.25);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight('#fff1d0', 3.4);
  sun.position.set(-16, 28, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 3;
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight('#dbeeff', 0.85);
  rim.position.set(18, 12, -20);
  scene.add(rim);

  const resources = new Set();
  const geometries = new Map();
  const materials = new Map();
  const track = resource => (resources.add(resource), resource);
  const geometry = (key, build) => {
    if (!geometries.has(key)) geometries.set(key, track(build()));
    return geometries.get(key);
  };
  const material = (key, color, extra = {}) => {
    if (!materials.has(key)) materials.set(key, track(new THREE.MeshStandardMaterial({ color, roughness: 0.84, flatShading: true, ...extra })));
    return materials.get(key);
  };
  const boxGeometry = geometry('box', () => new THREE.BoxGeometry(1, 1, 1));
  const sphereGeometry = geometry('sphere', () => new THREE.SphereGeometry(1, 8, 6));
  const icoGeometry = geometry('ico', () => new THREE.IcosahedronGeometry(1, 0));
  const cylinderGeometry = geometry('cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 7));
  const wood = material('wood', '#ae825b');
  const paleWood = material('pale-wood', '#c8a77e');
  const bark = material('bark', '#96704f');
  const grassMaterial = material('grass', '#88ad70');
  const bladeMaterial = material('blades', '#7fa761', { side: THREE.DoubleSide });
  const foliageMaterial = material('foliage', '#70a466');
  const stemMaterial = material('stems', '#69924e');
  const flowerMaterial = material('flowers', '#ffffff');
  const centerMaterial = material('flower-center', '#f6c958', { emissive: '#e8b14a', emissiveIntensity: 0.06 });
  const fruitMaterial = material('fruit', '#dd8e72');
  const snowMaterial = material('snow', '#f0f4f0');
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const pickables = [];
  const world = new THREE.Group();
  scene.add(world);

  function mesh(geom, mat, position, scale = [1, 1, 1], rotation = [0, 0, 0], parent = world) {
    const object = new THREE.Mesh(geom, mat);
    object.position.set(...position);
    object.scale.set(...scale);
    object.rotation.set(...rotation);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  function batch(geom, mat, items, parent = world, castShadow = true) {
    const object = new THREE.InstancedMesh(geom, mat, Math.max(1, items.length));
    object.count = items.length;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      dummy.position.set(...item.p);
      dummy.scale.set(...(item.s ?? [1, 1, 1]));
      dummy.rotation.set(...(item.r ?? [0, 0, 0]));
      dummy.updateMatrix();
      object.setMatrixAt(i, dummy.matrix);
      if (item.c) object.setColorAt(i, color.set(item.c));
    }
    object.castShadow = castShadow;
    object.receiveShadow = true;
    object.instanceMatrix.needsUpdate = true;
    if (object.instanceColor) object.instanceColor.needsUpdate = true;
    parent.add(object);
    return object;
  }

  function roundedShape(width, depth, radius) {
    const s = new THREE.Shape();
    const x = -width / 2;
    const y = -depth / 2;
    s.moveTo(x + radius, y);
    s.lineTo(x + width - radius, y);
    s.quadraticCurveTo(x + width, y, x + width, y + radius);
    s.lineTo(x + width, y + depth - radius);
    s.quadraticCurveTo(x + width, y + depth, x + width - radius, y + depth);
    s.lineTo(x + radius, y + depth);
    s.quadraticCurveTo(x, y + depth, x, y + depth - radius);
    s.lineTo(x, y + radius);
    s.quadraticCurveTo(x, y, x + radius, y);
    return s;
  }

  function islandLayer(width, depth, thickness, y, mat, bevel) {
    const shape = roundedShape(width, depth, 4);
    const geo = track(new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 12 }));
    return mesh(geo, mat, [0, y, 0], [1, 1, 1], [-Math.PI / 2, 0, 0]);
  }

  islandLayer(32.3, 24.3, 1.5, -3.1, material('deep-earth', '#af8b66'), 0.3);
  islandLayer(33.5, 25.5, 1.2, -1.6, material('earth', '#ceae80'), 0.22);
  islandLayer(34, 26, 0.28, -0.33, grassMaterial, 0.15);
  const floor = mesh(geometry('floor', () => new THREE.PlaneGeometry(240, 240)), material('floor', '#e9eee7'), [0, -4.4, 0], [1, 1, 1], [-Math.PI / 2, 0, 0], scene);
  floor.castShadow = false;

  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-8, 0.025, -1), new THREE.Vector3(-6.5, 0.025, 3.6),
    new THREE.Vector3(-2, 0.025, 6.5), new THREE.Vector3(3, 0.025, 7.6),
    new THREE.Vector3(8.6, 0.025, 6.3), new THREE.Vector3(11, 0.025, 0),
    new THREE.Vector3(8.5, 0.025, -5.8),
  ]);
  const pathGeo = track(new THREE.TubeGeometry(path, 100, 0.65, 8, false));
  const walkway = mesh(pathGeo, material('path', '#dcd2aa'), [0, 0.035, 0], [1, 0.11, 1]);
  walkway.castShadow = false;
  const stepping = [];
  for (let i = 0; i < 25; i++) {
    const p = path.getPoint(i / 24);
    stepping.push({ p: [p.x + range(-0.12, 0.12), 0.065, p.z], s: [range(0.33, 0.47), 0.025, range(0.2, 0.33)], r: [0, range(-2, 2), 0], c: ['#ddd8bd', '#e8dfc4', '#cfc9ae'][i % 3] });
  }
  batch(sphereGeometry, material('path-stones', '#ffffff'), stepping, world, false);

  // Low, faceted pond on the front left: insects are not simulated as drinking.
  const pond = mesh(geometry('pond', () => new THREE.CircleGeometry(1, 48)), material('pond', '#88c5c2', { roughness: 0.21, metalness: 0.08 }), [-8.8, 0.055, 7.4], [3.2, 1.85, 1], [-Math.PI / 2, 0, 0]);
  pond.castShadow = false;
  const shore = [];
  for (let i = 0; i < 30; i++) {
    const angle = i / 30 * Math.PI * 2;
    shore.push({ p: [-8.8 + Math.cos(angle) * 3.23, 0.13, 7.4 + Math.sin(angle) * 1.88], s: [range(0.22, 0.43), range(0.12, 0.23), range(0.18, 0.35)], r: [range(0, 2), range(0, 2), 0], c: ['#c5cbb0', '#b9c1ac', '#d4d2b8'][i % 3] });
  }
  for (let i = 0; i < 32; i++) {
    const side = i % 2 ? 1 : -1;
    shore.push({ p: [side * range(14.2, 16), range(0.05, 0.18), range(-9.5, 10.2)], s: [range(0.18, 0.55), range(0.15, 0.44), range(0.22, 0.5)], r: [0, range(0, 6.2), 0], c: '#bbc2a8' });
  }
  batch(icoGeometry, material('stones', '#ffffff'), shore);
  const lilyPads = [];
  for (let i = 0; i < 8; i++) lilyPads.push({ p: [-9.4 + range(-1.6, 1.7), 0.07, 7.5 + range(-0.8, 0.7)], s: [range(0.15, 0.35), 0.018, range(0.15, 0.3)], r: [0, range(0, 6), 0] });
  batch(sphereGeometry, material('lily', '#79ad83'), lilyPads, world, false);
  const ripple = mesh(geometry('ripple', () => new THREE.TorusGeometry(0.7, 0.016, 4, 40)), material('ripple', '#c5e6d8', { transparent: true, opacity: 0.6 }), [-7.8, 0.084, 7.2], [1, 0.7, 1], [-Math.PI / 2, 0, 0]);
  ripple.castShadow = false;

  // One working hive, with three super boxes. These are one colony, not three.
  const hive = new THREE.Group();
  hive.position.set(-9, 0, -2);
  hive.rotation.y = Math.PI / 2;
  world.add(hive);
  const hiveParts = [];
  const addHive = (mat, p, s, r) => {
    const object = mesh(boxGeometry, mat, p, s, r ?? [0, 0, 0], hive);
    object.userData.pickType = 'hive';
    hiveParts.push(object);
    return object;
  };
  const cream = material('hive-cream', '#efe4b4');
  const sage = material('hive-sage', '#a2b7a0');
  const teal = material('hive-roof', '#667f75');
  const dark = material('hive-dark', '#554e37');
  const legItems = [];
  for (const x of [-1.08, 1.08]) for (const z of [-0.74, 0.74]) legItems.push({ p: [x, 0.32, z], s: [0.26, 0.64, 0.28] });
  batch(boxGeometry, wood, legItems, hive);
  addHive(paleWood, [0, 0.63, 0], [3.05, 0.2, 2.54]);
  addHive(cream, [0, 1.11, 0], [2.8, 0.74, 2.32]);
  addHive(sage, [0, 1.9, 0], [2.8, 0.74, 2.32]);
  addHive(cream, [0, 2.69, 0], [2.8, 0.74, 2.32]);
  addHive(teal, [0, 3.17, 0], [3.17, 0.2, 2.66]);
  addHive(material('hive-top', '#789086'), [0, 3.31, 0], [2.98, 0.08, 2.48]);
  addHive(dark, [0, 0.83, 1.17], [1.1, 0.15, 0.035]);
  addHive(paleWood, [0, 0.69, 1.48], [1.65, 0.11, 0.85]);
  const handles = [1.2, 1.98, 2.75].map(y => ({ p: [0, y, 1.172], s: [0.62, 0.073, 0.03] }));
  batch(boxGeometry, material('handles', '#a6996e'), handles, hive, false);
  const straps = [-0.91, 0.91].map(x => ({ p: [x, 1.94, 1.177], s: [0.048, 2.22, 0.035] }));
  batch(boxGeometry, material('hive-trim', '#d3c697'), straps, hive, false);
  const crest = mesh(geometry('crest', () => new THREE.CircleGeometry(0.3, 6)), material('crest', '#c2a260'), [0, 2.6, 1.188], [1, 1, 1], [0, 0, 0], hive);
  crest.castShadow = false;
  pickables.push(...hiveParts);
  const entrance = new THREE.Vector3(-7.51, 0.87, -2);

  // A cutaway teaching view. Cell counts are representative marks scaled from
  // the daily stage totals; they are not literal one-cell-per-bee records.
  const hiveExteriorParts = [...hive.children];
  const hiveInterior = new THREE.Group();
  hiveInterior.visible = false;
  hive.add(hiveInterior);
  const combBack = mesh(boxGeometry, material('comb-shadow', '#5d482d', { roughness: 1 }), [0, 1.95, 0.98], [2.7, 2.62, 0.09], [0, 0, 0], hiveInterior);
  combBack.userData.pickType = 'hive';
  pickables.push(combBack);
  const combFrameItems = [
    { p: [0, 0.62, 1.11], s: [3.02, 0.16, 0.16] }, { p: [0, 3.29, 1.11], s: [3.02, 0.16, 0.16] },
    { p: [-1.43, 1.96, 1.11], s: [0.16, 2.82, 0.16] }, { p: [1.43, 1.96, 1.11], s: [0.16, 2.82, 0.16] },
  ];
  batch(boxGeometry, paleWood, combFrameItems, hiveInterior, false);
  const combCellGeometry = geometry('comb-cell', () => new THREE.CylinderGeometry(0.118, 0.118, 0.075, 6));
  const combCellPositions = [];
  for (let row = 0; row < 11; row++) for (let column = 0; column < 10; column++) {
    combCellPositions.push(new THREE.Vector3(-1.08 + column * 0.24 + (row % 2) * 0.12, 0.82 + row * 0.215, 1.18));
  }
  const combEmpty = new THREE.InstancedMesh(combCellGeometry, material('comb-empty', '#c59646', { roughness: 0.88 }), combCellPositions.length);
  combEmpty.count = combCellPositions.length;
  combEmpty.castShadow = false;
  for (let i = 0; i < combCellPositions.length; i++) {
    dummy.position.copy(combCellPositions[i]);dummy.rotation.set(Math.PI / 2, 0, 0);dummy.scale.set(1, 1, 1);dummy.updateMatrix();combEmpty.setMatrixAt(i, dummy.matrix);
  }
  combEmpty.instanceMatrix.needsUpdate = true;hiveInterior.add(combEmpty);
  const cellStyles = {
    egg: material('cell-egg', '#fff4cf', { emissive: '#f2d98c', emissiveIntensity: 0.15 }),
    larva: material('cell-larva', '#f6eee1', { emissive: '#fff4dd', emissiveIntensity: 0.1 }),
    capped: material('cell-capped', '#b77b42'),
    honey: material('cell-honey', '#f2b83f', { emissive: '#d89325', emissiveIntensity: 0.22 }),
  };
  const combStages = {};
  for (const [key, mat] of Object.entries(cellStyles)) {
    const object = new THREE.InstancedMesh(combCellGeometry, mat, combCellPositions.length);
    object.count = 0;object.castShadow = false;object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);hiveInterior.add(object);combStages[key] = object;
  }
  const queen = new THREE.Group();
  queen.position.set(-0.5, 2.1, 1.38);hiveInterior.add(queen);
  const interiorBee = material('interior-bee', '#e5a92f', { roughness: 0.65 });
  const interiorBlack = material('interior-bee-black', '#4c3c27', { roughness: 0.82 });
  mesh(sphereGeometry, material('queen-gold', '#edb83c', { emissive: '#bf791f', emissiveIntensity: 0.18 }), [0, 0, 0], [0.12, 0.11, 0.32], [Math.PI / 2, 0, 0], queen);
  mesh(sphereGeometry, interiorBlack, [0, 0.24, 0], [0.12, 0.12, 0.12], [0, 0, 0], queen);
  const queenCrown = mesh(geometry('queen-crown', () => new THREE.ConeGeometry(0.11, 0.18, 5)), material('queen-crown', '#f8dc72', { emissive: '#e4b735', emissiveIntensity: 0.25 }), [0, 0.42, 0], [1, 1, 1], [0, 0, Math.PI], queen);
  queenCrown.castShadow = false;
  const nurseCount = 14;
  const nurseMesh = new THREE.InstancedMesh(sphereGeometry, interiorBee, nurseCount);
  nurseMesh.count = nurseCount;nurseMesh.castShadow = false;nurseMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);hiveInterior.add(nurseMesh);

  // A single readable physical label, generated locally (no remote asset).
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256;
  labelCanvas.height = 128;
  const labelContext = labelCanvas.getContext('2d');
  if (labelContext) {
    labelContext.fillStyle = '#f4efd8';
    labelContext.fillRect(0, 0, 256, 128);
    labelContext.fillStyle = '#52705a';
    labelContext.font = 'bold 19px Arial';
    labelContext.textAlign = 'center';
    labelContext.fillText('THE NEED FOR BEES', 128, 39);
    labelContext.font = 'bold 40px Arial';
    labelContext.fillText('HIVE 01', 128, 92);
  }
  const labelTexture = track(new THREE.CanvasTexture(labelCanvas));
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  const labelMat = material('label', '#ffffff', { map: labelTexture });
  mesh(boxGeometry, wood, [-6.2, 0.7, -4.3], [0.15, 1.4, 0.15]);
  const label = mesh(geometry('label-plane', () => new THREE.PlaneGeometry(2.1, 1.05)), labelMat, [-6.2, 1.56, -4.24], [1, 1, 1], [0, 0.38, 0]);
  label.userData.pickType = 'hive';
  pickables.push(label);

  const benchParts = [
    { p: [-11.1, 0.55, 1.5], s: [3.1, 0.16, 0.8] },
    { p: [-12.1, 0.28, 1.5], s: [0.2, 0.55, 0.6] },
    { p: [-10.1, 0.28, 1.5], s: [0.2, 0.55, 0.6] },
    { p: [-11.1, 1.13, 1.2], s: [3.1, 0.5, 0.12] },
  ];
  batch(boxGeometry, paleWood, benchParts);
  mesh(geometry('pot', () => new THREE.CylinderGeometry(0.25, 0.2, 0.36, 10)), material('pot', '#9ba99e'), [-11.5, 0.83, 1.5]);
  mesh(geometry('can-handle', () => new THREE.TorusGeometry(0.22, 0.025, 5, 12)), materials.get('pot'), [-11.5, 1.03, 1.5]);

  // Orchard instancing: trunks, branches, leaves, blossom/fruit and snow caps.
  const treeSpots = [[-13, -8, 1.0], [-8, -10, 0.86], [-1, -10.9, 1.15], [8.8, -10.5, 0.88], [13.9, -7.2, 1.0], [14.5, 0.5, 0.8], [13.5, 8.4, 1.05], [-14.4, 0.3, 0.84], [-13.3, 9.0, 0.77], [0.1, 10.8, 0.66]];
  const trunks = [], branches = [], foliage = [], fruits = [], snowCaps = [];
  for (const [x, z, size] of treeSpots) {
    const h = size * range(2.2, 2.9);
    trunks.push({ p: [x, h / 2, z], s: [size * 0.24, h, size * 0.22] });
    for (let j = 0; j < 3; j++) {
      const a = j * Math.PI * 2 / 3;
      branches.push({ p: [x + Math.cos(a) * size * 0.36, h * 0.7, z + Math.sin(a) * size * 0.36], s: [size * 0.1, size * 1.25, size * 0.1], r: [Math.sin(a) * 0.72, 0, -Math.cos(a) * 0.72] });
    }
    for (let j = 0; j < 5; j++) {
      const a = j * Math.PI * 2 / 5;
      const p = [x + Math.cos(a) * size * 0.8, h + (j === 0 ? 0.95 : 0.25) * size, z + Math.sin(a) * size * 0.8];
      const s = [size * range(1.05, 1.4), size * range(1.0, 1.3), size * range(1.0, 1.35)];
      foliage.push({ p, s, r: [0.2, range(0, 3), 0.1], c: new THREE.Color().setHSL(range(0.23, 0.31), 0.14, range(0.78, 0.94)) });
      snowCaps.push({ p: [p[0], p[1] + s[1] * 0.7, p[2]], s: [s[0] * 0.85, s[1] * 0.32, s[2] * 0.85] });
      for (let k = 0; k < 2; k++) fruits.push({ p: [p[0] + range(-0.6, 0.6), p[1] + range(-0.5, 0.5), p[2] + s[2] * 0.65], s: [0.13 * size, 0.15 * size, 0.13 * size] });
    }
  }
  batch(cylinderGeometry, bark, trunks);
  batch(cylinderGeometry, bark, branches);
  const treeLeaves = batch(icoGeometry, foliageMaterial, foliage);
  const treeFruit = batch(icoGeometry, fruitMaterial, fruits);
  const treeSnow = batch(icoGeometry, snowMaterial, snowCaps);
  treeSnow.visible = false;

  const fence = [];
  function fenceRun(x1, z1, x2, z2, count) {
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const x = x1 + (x2 - x1) * t;
      const z = z1 + (z2 - z1) * t;
      fence.push({ p: [x, 0.6, z], s: [0.15, 1.2, 0.15] });
      if (i < count) {
        const dx = (x2 - x1) / count;
        const dz = (z2 - z1) / count;
        for (const y of [0.38, 0.9]) fence.push({ p: [x + dx / 2, y, z + dz / 2], s: [Math.hypot(dx, dz), 0.1, 0.09], r: [0, -Math.atan2(dz, dx), 0] });
      }
    }
  }
  fenceRun(-13.8, -11.7, 13.8, -11.7, 17);
  fenceRun(-15.2, -9, -15.2, 7.5, 10);
  fenceRun(15.2, -8.5, 15.2, 8.3, 10);
  batch(boxGeometry, material('fence', '#d8c49e'), fence);

  // Two recognizable flowering crop beds. All positions are pre-seeded.
  const flowerRecords = [];
  const bedDefinitions = [{ x: 4.5, z: 3.4, rx: 5.0, rz: 2.8, rows: 8, columns: 16 }, { x: 4.8, z: -5.0, rx: 4.3, rz: 2.45, rows: 7, columns: 15 }];
  for (let bed = 0; bed < bedDefinitions.length; bed++) {
    const b = bedDefinitions[bed];
    for (let row = 0; row < b.rows; row++) for (let column = 0; column < b.columns; column++) {
      const nx = (column / (b.columns - 1) * 2 - 1);
      const nz = (row / (b.rows - 1) * 2 - 1);
      if (nx * nx + nz * nz > 1.22) continue;
      flowerRecords.push({ x: b.x + nx * b.rx + range(-0.16, 0.16), z: b.z + nz * b.rz + range(-0.12, 0.12), h: range(0.43, 0.88), size: range(0.13, 0.23), color: ['#f3c68e', '#e4aeba', '#efe8c7', '#b4acd1', '#f1d37a'][Math.floor(random() * 5)], bed, turn: range(0, Math.PI * 2) });
    }
  }
  // Interleave populations so partial bloom covers both patches naturally.
  for (let i = flowerRecords.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [flowerRecords[i], flowerRecords[j]] = [flowerRecords[j], flowerRecords[i]];
  }
  const stems = [], petals = [], centers = [], leaves = [];
  for (const flower of flowerRecords) {
    stems.push({ p: [flower.x, flower.h / 2, flower.z], s: [0.023, flower.h, 0.023] });
    centers.push({ p: [flower.x, flower.h + 0.035, flower.z], s: [flower.size * 0.47, 0.06, flower.size * 0.47] });
    for (let j = 0; j < 5; j++) {
      const angle = flower.turn + j * Math.PI * 2 / 5;
      petals.push({ p: [flower.x + Math.cos(angle) * flower.size * 0.62, flower.h + 0.014, flower.z + Math.sin(angle) * flower.size * 0.62], s: [flower.size * 0.75, 0.048, flower.size * 0.46], r: [0, -angle, 0], c: flower.color });
    }
    leaves.push({ p: [flower.x + 0.08, flower.h * 0.35, flower.z], s: [0.15, 0.025, 0.058], r: [0, flower.turn, 0.38] });
  }
  const stemMesh = batch(cylinderGeometry, stemMaterial, stems, world, false);
  const leafMesh = batch(sphereGeometry, stemMaterial, leaves, world, false);
  const petalMesh = batch(sphereGeometry, flowerMaterial, petals, world, false);
  const centerMesh = batch(sphereGeometry, centerMaterial, centers, world, false);
  petalMesh.userData.pickType = 'flowers';
  centerMesh.userData.pickType = 'flowers';
  pickables.push(petalMesh, centerMesh);
  const flowerHitMaterial = track(new THREE.MeshBasicMaterial({ visible: false }));
  for (const b of bedDefinitions) {
    const hit = mesh(boxGeometry, flowerHitMaterial, [b.x, 0.35, b.z], [b.rx * 1.85, 0.7, b.rz * 1.8]);
    hit.userData.pickType = 'flowers';
    pickables.push(hit);
  }

  const bladeGeo = track(new THREE.BufferGeometry());
  bladeGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.065, 0, 0, 0.065, 0, 0, 0.015, 0.5, 0], 3));
  bladeGeo.computeVertexNormals();
  const grasses = [];
  for (let i = 0; i < 1350; i++) {
    const x = range(-15.7, 15.7);
    const z = range(-11.4, 11.4);
    if ((x + 8.8) ** 2 / 12 + (z - 7.4) ** 2 / 4.5 < 1 || (x < -6.1 && x > -12 && z > -4.6 && z < 3.5)) continue;
    if (bedDefinitions.some(b => (x - b.x) ** 2 / (b.rx * b.rx) + (z - b.z) ** 2 / (b.rz * b.rz) < 1.25)) continue;
    if (path.getPoints(25).some(p => Math.hypot(p.x - x, p.z - z) < 0.75)) continue;
    grasses.push({ p: [x, 0.01, z], s: [range(0.5, 1.2), range(0.23, 0.9), range(0.7, 1.1)], r: [0, range(0, 6.28), range(-0.12, 0.12)], c: new THREE.Color().setHSL(0.17, 0.07, range(0.75, 1)) });
  }
  const grassBlades = batch(bladeGeo, bladeMaterial, grasses, world, false);

  const clouds = new THREE.Group();
  world.add(clouds);
  const cloudRecords = [];
  for (const [x, y, z, size] of [[-18, 11, -6, 1.4], [0, 14, -19, 1.7], [18, 12, -13, 1.45]]) {
    for (let j = 0; j < 6; j++) cloudRecords.push({ p: [x + (j - 2.5) * 0.75 * size, y + Math.sin(j * 2.1) * 0.25, z + Math.cos(j * 1.7) * 0.4], s: [size * range(0.8, 1.2), size * range(0.48, 0.75), size * range(0.7, 0.9)] });
  }
  const cloudMaterial = material('clouds', '#f6f5e9', { roughness: 1 });
  batch(sphereGeometry, cloudMaterial, cloudRecords, clouds, false);

  // Animated bees use six instanced draw groups, including stripes and wings.
  const MAX_BEES = 200;
  const beeParts = {};
  function beePart(name, geom, mat, perBee = 1, castsShadow = false) {
    const object = new THREE.InstancedMesh(geom, mat, MAX_BEES * perBee);
    object.count = 0;
    object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    object.frustumCulled = false;
    object.castShadow = castsShadow;
    world.add(object);
    beeParts[name] = { object, perBee };
    return object;
  }
  const yellow = material('bee-yellow', '#f2bf4a', { roughness: 0.6 });
  const beeBlack = material('bee-black', '#51442e', { roughness: 0.8 });
  const bodyMesh = beePart('body', sphereGeometry, yellow, 1, true);
  bodyMesh.userData.pickType = 'bee';
  pickables.push(bodyMesh);
  beePart('stripes', geometry('bee-stripe', () => new THREE.TorusGeometry(0.17, 0.037, 4, 9)), beeBlack, 2);
  beePart('head', sphereGeometry, beeBlack);
  beePart('eyes', sphereGeometry, material('bee-eyes', '#fff8d7'), 2);
  beePart('pupils', sphereGeometry, beeBlack, 2);
  beePart('wings', sphereGeometry, material('bee-wings', '#e8f5f4', { transparent: true, opacity: 0.66, roughness: 0.2, depthWrite: false }), 2);
  beePart('pollen', sphereGeometry, material('bee-pollen', '#f2a928', { emissive: '#dc821c', emissiveIntensity: 0.24 }), 2);
  const beePositions = Array.from({ length: MAX_BEES }, () => new THREE.Vector3());
  const beeDirections = Array.from({ length: MAX_BEES }, () => new THREE.Vector3(1, 0, 0));
  const beeSeeds = Array.from({ length: MAX_BEES }, (_, index) => ({ phase: mod(index * 0.61803398875), lift: range(1.5, 3.2), bend: range(-2.3, 2.3), size: range(0.82, 1.16), speed: range(0.025, 0.036), flower: (index * 37) % flowerRecords.length }));
  const matrix = new THREE.Matrix4();
  const localMatrix = new THREE.Matrix4();
  const rootMatrix = new THREE.Matrix4();
  const localPosition = new THREE.Vector3();
  const localScale = new THREE.Vector3();
  const localQuaternion = new THREE.Quaternion();
  const beeQuaternion = new THREE.Quaternion();
  const localEuler = new THREE.Euler();
  const forward = new THREE.Vector3(0, 0, 1);
  const lookAhead = new THREE.Vector3();
  const targetPosition = new THREE.Vector3();
  const c1 = new THREE.Vector3();
  const c2 = new THREE.Vector3();

  function cubic(a, b, c, d, t, out) {
    const u = 1 - t;
    out.set(0, 0, 0).addScaledVector(a, u * u * u).addScaledVector(b, 3 * u * u * t).addScaledVector(c, 3 * u * t * t).addScaledVector(d, t * t * t);
    return out;
  }

  function beeLocation(index, motion, out, activity, visibleFlowers) {
    const record = beeSeeds[index];
    const flower = flowerRecords[record.flower % Math.max(1, visibleFlowers)];
    const phase = mod(motion * record.speed + record.phase);
    targetPosition.set(flower.x, flower.h + 0.23, flower.z);
    const flightRange = 0.3 + activity * 0.7;
    targetPosition.lerpVectors(entrance, targetPosition, flightRange);
    c1.set(entrance.x + 3.2, entrance.y + record.lift, entrance.z + record.bend);
    c2.set(targetPosition.x - 1.5, targetPosition.y + record.lift * 0.7, targetPosition.z + record.bend * 0.5);
    if (phase < 0.06) {
      out.copy(entrance);
      out.y += Math.sin(phase * 100 + index) * 0.07;
      out.z += record.bend * 0.1;
    } else if (phase < 0.43) cubic(entrance, c1, c2, targetPosition, (phase - 0.06) / 0.37, out);
    else if (phase < 0.62) {
      out.copy(targetPosition);
      out.x += Math.sin(phase * 50 + index) * 0.11;
      out.z += Math.cos(phase * 40 + index) * 0.11;
      out.y += Math.sin(phase * 55 + index) * 0.035;
    } else if (phase < 0.97) {
      c1.z += 0.65;
      c2.z += 0.65;
      cubic(targetPosition, c2, c1, entrance, (phase - 0.62) / 0.35, out);
    } else out.copy(entrance);
    return out;
  }

  function setBeePart(name, index, p, s, rotation = [0, 0, 0]) {
    localPosition.set(...p);
    localScale.set(...s);
    localEuler.set(...rotation);
    localQuaternion.setFromEuler(localEuler);
    localMatrix.compose(localPosition, localQuaternion, localScale);
    matrix.multiplyMatrices(rootMatrix, localMatrix);
    beeParts[name].object.setMatrixAt(index, matrix);
  }

  function updateBees(count, motion, activity, visibleFlowers) {
    for (const { object, perBee } of Object.values(beeParts)) object.count = count * perBee;
    for (let i = 0; i < count; i++) {
      const position = beeLocation(i, motion, beePositions[i], activity, visibleFlowers);
      beeLocation(i, motion + 0.08, lookAhead, activity, visibleFlowers);
      const direction = beeDirections[i].subVectors(lookAhead, position);
      if (direction.lengthSq() < 0.000001) direction.set(0, 0, 1);
      else direction.normalize();
      beeQuaternion.setFromUnitVectors(forward, direction);
      const size = beeSeeds[i].size;
      localScale.setScalar(size);
      rootMatrix.compose(position, beeQuaternion, localScale);
      setBeePart('body', i, [0, 0, 0], [0.2, 0.155, 0.31]);
      setBeePart('stripes', i * 2, [0, 0, -0.11], [1.08, 0.83, 0.8]);
      setBeePart('stripes', i * 2 + 1, [0, 0, 0.095], [1.06, 0.84, 0.8]);
      setBeePart('head', i, [0, 0.024, 0.29], [0.145, 0.135, 0.14]);
      const flap = Math.sin(motion * 22 + i * 1.7) * 0.7;
      const phase = mod(motion * beeSeeds[i].speed + beeSeeds[i].phase);
      const pollenScale = visibleFlowers > 0 && activity > 0.05 && phase >= 0.62 && phase < 0.97 ? 0.072 : 0.0001;
      for (let side = 0; side < 2; side++) {
        const sign = side ? 1 : -1;
        setBeePart('eyes', i * 2 + side, [sign * 0.065, 0.069, 0.402], [0.042, 0.044, 0.025]);
        setBeePart('pupils', i * 2 + side, [sign * 0.065, 0.07, 0.422], [0.019, 0.024, 0.013]);
        setBeePart('wings', i * 2 + side, [sign * 0.19, 0.155, -0.08], [0.21, 0.022, 0.3], [0.1, sign * 0.35, sign * (0.3 + flap)]);
        setBeePart('pollen', i * 2 + side, [sign * 0.17, -0.105, -0.17], [pollenScale, pollenScale * 0.82, pollenScale]);
      }
    }
    for (const { object } of Object.values(beeParts)) object.instanceMatrix.needsUpdate = true;
  }

  const routes = new THREE.Group();
  routes.visible = false;
  world.add(routes);
  const routeMaterial = track(new THREE.LineDashedMaterial({ color: '#e2b75d', dashSize: 0.32, gapSize: 0.22, transparent: true, opacity: 0.62 }));
  for (let i = 0; i < 4; i++) {
    const flower = flowerRecords[i * 21];
    const route = new THREE.CubicBezierCurve3(entrance.clone(), new THREE.Vector3(-4.2, 4.0 + i * 0.25, -2 + i * 0.2), new THREE.Vector3(flower.x - 2, 3.0, flower.z), new THREE.Vector3(flower.x, flower.h + 0.2, flower.z));
    const line = new THREE.Line(track(new THREE.BufferGeometry().setFromPoints(route.getPoints(65))), routeMaterial);
    line.computeLineDistances();
    routes.add(line);
  }

  const RAIN_COUNT = 380;
  const rainRecords = Array.from({ length: RAIN_COUNT }, () => ({ x: range(-16.5, 16.5), z: range(-12.5, 12.5), y: range(0, 16) }));
  const rainPositions = new Float32Array(RAIN_COUNT * 6);
  const rainGeometry = track(new THREE.BufferGeometry());
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const rain = new THREE.LineSegments(rainGeometry, track(new THREE.LineBasicMaterial({ color: '#8dbad2', transparent: true, opacity: 0.7 })));
  rain.visible = false;
  rain.frustumCulled = false;
  world.add(rain);
  const snowPositions = new Float32Array(180 * 3);
  const snowGeometry = track(new THREE.BufferGeometry());
  snowGeometry.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const snow = new THREE.Points(snowGeometry, track(new THREE.PointsMaterial({ color: '#ffffff', size: 0.11, transparent: true, opacity: 0.82, depthWrite: false })));
  snow.visible = false;
  snow.frustumCulled = false;
  world.add(snow);
  const groundSnow = mesh(geometry('ground-snow', () => new THREE.ShapeGeometry(roundedShape(33.6, 25.6, 4))), snowMaterial, [0, 0.045, 0], [1, 1, 1], [-Math.PI / 2, 0, 0]);
  groundSnow.visible = false;
  groundSnow.castShadow = false;
  const hiveSnow = mesh(boxGeometry, snowMaterial, [0, 3.41, 0], [3.02, 0.12, 2.5], [0, 0, 0], hive);
  hiveSnow.visible = false;

  const pulseGeo = geometry('pollination-pulse', () => new THREE.TorusGeometry(0.45, 0.017, 4, 28));
  const pulseMat = material('pollination-pulse', '#f3d178', { transparent: true, opacity: 0.38, emissive: '#d8b349', emissiveIntensity: 0.4, depthWrite: false });
  const pulse = new THREE.InstancedMesh(pulseGeo, pulseMat, 6);
  pulse.frustumCulled = false;
  world.add(pulse);

  function updateHiveCutaway(state, motion) {
    if (!hiveInterior.visible) return;
    const eggs = Math.max(0, number(state.eggs));
    const brood = Math.max(0, number(state.brood));
    const immature = eggs + brood;
    const stageCells = Math.round(82 * clamp(immature / (immature + 8000), 0, 1));
    const eggCells = immature > 0 ? Math.round(stageCells * eggs / immature) : 0;
    const broodCells = Math.max(0, stageCells - eggCells);
    const larvaCells = Math.round(broodCells * 0.34);
    const cappedCells = broodCells - larvaCells;
    const honeyCells = Math.min(combCellPositions.length - stageCells, Math.round(12 + clamp(number(state.seasonalActivity), 0, 1) * 10));
    const counts = { egg: eggCells, larva: larvaCells, capped: cappedCells, honey: honeyCells };
    let cursor = Math.floor(mod(number(state.day), combCellPositions.length));
    for (const [key, object] of Object.entries(combStages)) {
      object.count = counts[key];
      for (let i = 0; i < object.count; i++) {
        const p = combCellPositions[cursor % combCellPositions.length];cursor++;
        dummy.position.set(p.x, p.y, 1.235);dummy.rotation.set(Math.PI / 2, 0, 0);dummy.scale.set(0.76, 0.58, 0.76);dummy.updateMatrix();object.setMatrixAt(i, dummy.matrix);
      }
      object.instanceMatrix.needsUpdate = true;
    }
    queen.position.x = Math.sin(motion * 0.12) * 0.52;
    queen.position.y = 2.04 + Math.sin(motion * 0.09) * 0.32;
    queen.rotation.z = Math.sin(motion * 0.08) * 0.14;
    nurseMesh.count = Math.round(clamp(number(state.hiveBees) / 1400, 3, nurseCount));
    for (let i = 0; i < nurseMesh.count; i++) {
      const p = combCellPositions[(i * 7 + Math.floor(motion * 0.05)) % combCellPositions.length];
      dummy.position.set(p.x + Math.sin(motion * 0.4 + i) * 0.05, p.y + Math.cos(motion * 0.32 + i) * 0.04, 1.35);
      dummy.rotation.set(0, 0, motion * 0.08 + i);dummy.scale.set(0.055, 0.12, 0.055);dummy.updateMatrix();nurseMesh.setMatrixAt(i, dummy.matrix);
    }
    nurseMesh.instanceMatrix.needsUpdate = true;
  }

  let quality = 'high';
  let disposed = false;
  let latest = { season: 'spring', weather: 'clear', activity: 1, flowerCoverage: 1, beeCount: 80, hour: 11, playing: false, motionTime: 0 };
  let lastMotion = null;
  let visibleFlowerCount = flowerRecords.length;
  let renderedBeeCount = 0;
  let appearanceKey = '';
  let cameraPreset = 'overview';
  let cameraTransition = null;
  let cameraUserControlled = false;
  let pointerStart = null;
  let selectedType = null;
  let detailMode = false;
  let lastVisitedFlowerCount = -1;
  let followIndex = 0;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const background = new THREE.Color();
  const targetColor = new THREE.Color();
  const overviewPosition = new THREE.Vector3(32, 29, 36);
  const followTarget = new THREE.Vector3();
  const followPosition = new THREE.Vector3();

  function pickDescription(type) {
    if (type === 'hive') return { type, title: 'HIVE 01 · 단일 군집', description: '쌓인 계상 상자는 모두 한 벌통을 구성합니다. 실제 군집의 알·미성숙 개체·내근벌·채집벌·수벌 수는 일별 모델에서 계산하며, 현재 수치는 선택 정보에서 확인합니다.' };
    if (type === 'flowers') return { type, title: '꽃밭 · 수분 대상', description: '꽃·벌의 크기와 간격은 관찰용으로 확대했습니다. 꽃의 표시량은 선택한 날짜의 개화 입력을 따릅니다. 이 3D 배치는 실제 20에이커 지도를 재현한 것이 아닙니다.' };
    return { type: 'bee', title: '채집벌 · 대표 개체', description: `화면에는 최대 ${MAX_BEES}개의 대표 개체를 표시합니다. 이 경로는 공간 설명용이며 수분 계산은 모델의 일별 수요·공급을 사용합니다. 실제 채집벌 수와 화면의 벌 수는 다릅니다.` };
  }

  function pointerDown(event) {
    pointerStart = { x: event.clientX, y: event.clientY };
  }
  function pointerUp(event) {
    if (!pointerStart || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 6) return;
    pointerStart = null;
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    scene.updateMatrixWorld(true);
    const hits = raycaster.intersectObjects(pickables, false);
    const hit = hits.find(item => item.object.userData.pickType);
    if (hit) {
      selectedType = hit.object.userData.pickType;
      if (selectedType === 'bee' && Number.isInteger(hit.instanceId)) followIndex = hit.instanceId;
      onSelect?.(pickDescription(selectedType));
    }
  }
  function cancelCameraTransition() {
    cameraTransition = null;
    cameraUserControlled = true;
    if (cameraPreset === 'follow') cameraPreset = 'manual';
  }
  renderer.domElement.addEventListener('pointerdown', pointerDown);
  renderer.domElement.addEventListener('pointerup', pointerUp);
  controls.addEventListener('start', cancelCameraTransition);

  function setCamera(preset = 'overview') {
    cameraUserControlled = false;
    const presets = {
      overview: { position: overviewPosition, target: new THREE.Vector3(0, 0.3, 0) },
      hive: { position: new THREE.Vector3(-1.8, 5.7, 6.7), target: new THREE.Vector3(-8.6, 1.5, -1.7) },
      inside: { position: new THREE.Vector3(-2.4, 3.7, -1.4), target: new THREE.Vector3(-8.2, 1.95, -2) },
      flowers: { position: new THREE.Vector3(12.5, 8.2, 15), target: new THREE.Vector3(4.4, 0.6, 2.5) },
    };
    if (preset === 'follow') {
      cameraPreset = 'follow';
      cameraTransition = null;
      return;
    }
    const chosen = presets[preset] ?? presets.overview;
    cameraPreset = Object.hasOwn(presets, preset) ? preset : 'overview';
    cameraTransition = { from: camera.position.clone(), fromTarget: controls.target.clone(), to: chosen.position.clone(), target: chosen.target.clone(), progress: 0 };
  }

  function setDetail(value) {
    detailMode = Boolean(value);
    hiveInterior.visible = detailMode;
    for (const object of hiveExteriorParts) object.visible = !detailMode;
    if (hiveSnow) hiveSnow.visible = !detailMode && latest.season === 'winter';
    if (detailMode) updateHiveCutaway(latest, lastMotion ?? 0);
  }

  function resize() {
    if (disposed) return;
    const width = Math.max(1, Math.round(container.clientWidth || 900));
    const height = Math.max(1, Math.round(container.clientHeight || 540));
    camera.aspect = width / height;
    // Shift the optical framing up to leave room for the caller's bottom time
    // controls. This is a view offset, not a changed FOV or stretched projection.
    const offsetFraction = width < 600 ? 0.015 : camera.aspect < 1.3 ? 0.20 : 0.12;
    camera.setViewOffset(width, height, 0, Math.round(height * offsetFraction), width, height);
    const overviewScale = Math.max(1.06, 1.18 / camera.aspect);
    overviewPosition.set(32, 29, 36).multiplyScalar(overviewScale);
    controls.maxDistance = Math.max(82, overviewPosition.length() * 1.4);
    camera.far = Math.max(180, overviewPosition.length() + 120);
    scene.fog.near = 68 * Math.max(1, overviewScale);
    scene.fog.far = 130 * Math.max(1, overviewScale);
    // The very first resize must move the real camera as well as the preset.
    // Later resizes preserve intentional orbit/pan/zoom by the user.
    if (cameraPreset === 'overview' && !cameraUserControlled) {
      if (cameraTransition) cameraTransition.to.copy(overviewPosition);
      else {
        camera.position.copy(overviewPosition);
        controls.target.set(0, 0.3, 0);
      }
    }
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  function setQuality(value = 'high') {
    quality = value === 'low' ? 'low' : 'high';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1.35 : 2));
    sun.shadow.mapSize.setScalar(quality === 'low' ? 1024 : 2048);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    renderer.shadowMap.needsUpdate = true;
    grassBlades.count = quality === 'low' ? Math.floor(grasses.length * 0.55) : grasses.length;
    resize();
  }

  function appearance(state) {
    const season = ['spring', 'summer', 'autumn', 'winter'].includes(state.season) ? state.season : 'spring';
    const weather = ['clear', 'rain', 'drought'].includes(state.weather) ? state.weather : 'clear';
    const key = `${season}:${weather}`;
    const winter = season === 'winter';
    if (key !== appearanceKey) {
      appearanceKey = key;
      const tones = {
        spring: { ground: '#91b678', grass: '#80a969', leaf: '#84b47b', fruit: '#edb9c5', sky: '#e9eee7' },
        summer: { ground: '#83a969', grass: '#739e58', leaf: '#6d9e63', fruit: '#d9a46f', sky: '#e3ede7' },
        autumn: { ground: '#b1ab72', grass: '#aaa36a', leaf: '#c29858', fruit: '#cc7e51', sky: '#eee9dd' },
        winter: { ground: '#c8d3c9', grass: '#c2ccbb', leaf: '#9eafa3', fruit: '#d5ded6', sky: '#e7edf0' },
      }[season];
      grassMaterial.color.set(weather === 'drought' ? '#baaa72' : tones.ground);
      bladeMaterial.color.set(weather === 'drought' ? '#b9a16b' : tones.grass);
      foliageMaterial.color.set(weather === 'drought' ? '#b49b66' : tones.leaf);
      stemMaterial.color.set(weather === 'drought' ? '#a49962' : '#69924e');
      fruitMaterial.color.set(tones.fruit);
      flowerMaterial.color.set(weather === 'drought' ? '#d7c5aa' : '#ffffff');
      treeSnow.visible = winter;
      hiveSnow.visible = winter && !detailMode;
      groundSnow.visible = winter;
      treeFruit.visible = !winter;
      snow.visible = winter;
      rain.visible = weather === 'rain' && !winter;
      pond.material.color.set(winter ? '#b0ced2' : weather === 'drought' ? '#93aaa0' : '#88c5c2');
      pond.material.roughness = winter ? 0.1 : 0.21;
      cloudMaterial.color.set(weather === 'rain' ? '#acbbc0' : '#f6f5e9');
      targetColor.set(weather === 'rain' ? '#cad9df' : tones.sky);
    }
    // Caller owns flower coverage. Season only changes appearance, not model values.
    const coverage = clamp(number(state.flowerCoverage, 1), 0, 1);
    visibleFlowerCount = Math.round(flowerRecords.length * coverage);
    petalMesh.count = visibleFlowerCount * 5;
    centerMesh.count = visibleFlowerCount;
    // Explicit flowering input wins over the illustrative seasonal palette.
    // A caller-selected winter bloom must remain visible even on a snowy island.
    stemMesh.visible = !winter || visibleFlowerCount > 0;
    leafMesh.visible = !winter || visibleFlowerCount > 0;
    petalMesh.visible = visibleFlowerCount > 0;
    centerMesh.visible = visibleFlowerCount > 0;
    const hour = mod(number(state.hour, 11), 24);
    const daylight = clamp(Math.sin((hour - 6) / 12 * Math.PI), 0, 1);
    const wet = weather === 'rain' ? 0.55 : 1;
    const nightColor = new THREE.Color('#445565');
    background.copy(nightColor).lerp(targetColor, 0.24 + daylight * 0.76);
    scene.background.copy(background);
    scene.fog.color.copy(background);
    floor.material.color.copy(background);
    ambient.intensity = 0.8 + daylight * 1.45;
    sun.intensity = (0.32 + daylight * 3.1) * wet;
    sun.color.set(daylight < 0.45 && daylight > 0.02 ? '#f3c398' : '#fff1d0');
    sun.position.set(-18 + Math.cos(hour / 24 * Math.PI * 2) * 8, 16 + daylight * 17, 14);
    rim.intensity = 0.35 + daylight * 0.55;
    centerMaterial.emissiveIntensity = 0.06 + clamp(number(state.pollinationRate), 0, 1) * 0.22;
  }

  function update(state = {}, dt = 1 / 60) {
    if (disposed) return;
    latest = { ...latest, ...state };
    const delta = clamp(number(dt, 1 / 60), 0, 0.1);
    const suppliedMotion = number(latest.motionTime, lastMotion ?? 0);
    // The caller owns time: a paused clock supplies the same value, while a
    // paused seek supplies a new one. Both forward and backward seeks must
    // immediately reproduce the same deterministic representative bee paths.
    lastMotion = suppliedMotion;
    const motion = lastMotion ?? 0;
    appearance(latest);
    renderedBeeCount = Math.round(clamp(number(latest.beeCount, 80), 0, MAX_BEES));
    updateBees(renderedBeeCount, motion, clamp(number(latest.activity, 1), 0, 1), visibleFlowerCount);
    updateHiveCutaway(latest, motion);
    const visitedFlowerCount = latest.inBloom ? Math.round(visibleFlowerCount * clamp(number(latest.pollinationRate), 0, 1)) : 0;
    if (visitedFlowerCount !== lastVisitedFlowerCount) {
      lastVisitedFlowerCount = visitedFlowerCount;
      for (let i = 0; i < visibleFlowerCount; i++) centerMesh.setColorAt(i, color.set(i < visitedFlowerCount ? '#ff9f2e' : '#f6c958'));
      if (centerMesh.instanceColor) centerMesh.instanceColor.needsUpdate = true;
    }
    clouds.position.x = Math.sin(motion * 0.016) * 1.2;
    ripple.scale.setScalar(0.85 + mod(motion * 0.05) * 0.4);
    ripple.material.opacity = 0.45 * (1 - mod(motion * 0.05));
    if (rain.visible) {
      const n = quality === 'low' ? 220 : RAIN_COUNT;
      rainGeometry.setDrawRange(0, n * 2);
      for (let i = 0; i < n; i++) {
        const r = rainRecords[i];
        const y = mod(r.y - motion * 4.5, 15);
        const offset = i * 6;
        rainPositions[offset] = r.x;
        rainPositions[offset + 1] = y;
        rainPositions[offset + 2] = r.z;
        rainPositions[offset + 3] = r.x - 0.13;
        rainPositions[offset + 4] = y - 0.58;
        rainPositions[offset + 5] = r.z + 0.055;
      }
      rainGeometry.attributes.position.needsUpdate = true;
    }
    if (snow.visible) {
      for (let i = 0; i < 180; i++) {
        const r = rainRecords[i];
        snowPositions[i * 3] = r.x + Math.sin(motion * 0.15 + i) * 0.35;
        snowPositions[i * 3 + 1] = mod(r.y - motion * 0.38, 13);
        snowPositions[i * 3 + 2] = r.z;
      }
      snowGeometry.attributes.position.needsUpdate = true;
    }
    pulse.visible = visibleFlowerCount > 0 && number(latest.pollinationRate) > 0.01;
    if (pulse.visible) {
      pulse.count = Math.min(6, visibleFlowerCount);
      for (let i = 0; i < pulse.count; i++) {
        const flower = flowerRecords[(i * 19) % visibleFlowerCount];
        const progress = mod(motion * 0.08 + i * 0.17);
        dummy.position.set(flower.x, 0.09, flower.z);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.setScalar(0.6 + progress * 1.2);
        dummy.updateMatrix();
        pulse.setMatrixAt(i, dummy.matrix);
      }
      pulse.instanceMatrix.needsUpdate = true;
    }
    if (cameraTransition) {
      cameraTransition.progress = Math.min(1, cameraTransition.progress + delta / 0.8);
      const t = cameraTransition.progress;
      const smooth = t * t * (3 - 2 * t);
      camera.position.lerpVectors(cameraTransition.from, cameraTransition.to, smooth);
      controls.target.lerpVectors(cameraTransition.fromTarget, cameraTransition.target, smooth);
      if (t >= 1) cameraTransition = null;
    } else if (cameraPreset === 'follow' && renderedBeeCount > 0) {
      const i = Math.min(followIndex, renderedBeeCount - 1);
      followTarget.copy(beePositions[i]);
      followPosition.copy(followTarget).addScaledVector(beeDirections[i], -3.9).add(new THREE.Vector3(2.4, 2.0, 1.0));
      const blend = 1 - Math.exp(-delta * 3.3);
      camera.position.lerp(followPosition, blend);
      controls.target.lerp(followTarget, blend);
    }
    controls.update();
    renderer.render(scene, camera);
  }

  function getStats() {
    return {
      renderer: 'WebGL / Three.js', quality,
      renderedBees: renderedBeeCount, visibleFlowers: visibleFlowerCount,
      drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      camera: cameraPreset, selected: selectedType,
      detailMode,
      motionTime: lastMotion ?? 0, playing: Boolean(latest.playing),
      modelAdults: number(latest.adults), modelForagers: number(latest.foragers),
      representation: '대표 개체 · 공간은 설명용 · 한 벌통',
    };
  }

  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(container);
  if (!resizeObserver) window.addEventListener('resize', resize);
  setQuality(container.clientWidth < 650 ? 'low' : 'high');
  controls.update();
  update(latest, 0);

  function dispose() {
    if (disposed) return;
    disposed = true;
    resizeObserver?.disconnect();
    window.removeEventListener('resize', resize);
    renderer.domElement.removeEventListener('pointerdown', pointerDown);
    renderer.domElement.removeEventListener('pointerup', pointerUp);
    controls.removeEventListener('start', cancelCameraTransition);
    controls.dispose();
    for (const resource of resources) resource.dispose?.();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { update, setCamera, setDetail, setRoutes: value => { routes.visible = Boolean(value); }, setQuality, resize, dispose, getStats };
}
