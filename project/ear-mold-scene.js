// FaceShift — rotating transparent silicone ear-mold component.
// Drop-in: import { mountEarMold } from './ear-mold-scene.js';
//          mountEarMold({ canvas, scrollContainer });

import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';
import { RoomEnvironment } from 'https://unpkg.com/three@0.161.0/examples/jsm/environments/RoomEnvironment.js';
import { ParametricGeometry } from 'https://unpkg.com/three@0.161.0/examples/jsm/geometries/ParametricGeometry.js';

// ---------- ear-mold geometry ----------------------------------------------
// A "lens" shaped like the silhouette of an outer ear: convex front, deep
// concave back, soft asymmetry. Built parametrically — no 3D model file.
function earOutline(theta) {
  // theta: 0..2π around the perimeter
  // Returns a Vector2 in equator plane (the outer rim of the mold).
  // Designed to suggest an ear silhouette: fuller upper helix, narrower lobule.
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  // base ellipse, taller than wide, like an ear silhouette
  const a = 0.92;
  const b = 1.22;
  let x = a * cos;
  let y = b * sin;

  // upper-back swell (helix area gets fuller)
  const upper = Math.max(0, sin); // 0 bottom, 1 top
  x += 0.10 * upper * (cos < 0 ? -cos : 0); // bias the back/top outward
  y += 0.06 * upper;

  // lower taper (lobule narrows)
  const lower = Math.max(0, -sin);
  x *= 1 - 0.18 * lower;
  y -= 0.04 * lower;

  // subtle front-edge concavity hinting at the antitragus notch
  const front = Math.max(0, cos);
  x -= 0.05 * front * Math.exp(-Math.pow((sin + 0.15) * 3, 2));

  return [x, y];
}

function moldSurface(u, v, target) {
  // u: 0..1 → angle around the outline
  // v: 0..1 → 0 = front center peak, 0.5 = rim/equator, 1 = back center deepest
  const theta = u * Math.PI * 2;
  const [bx, by] = earOutline(theta);

  // radial scale: 0 at poles, 1 at equator — like a flattened ellipsoid
  const phi = (v - 0.5) * Math.PI; // -π/2 .. +π/2
  const radial = Math.cos(phi);

  // z profile — asymmetric: shallow dome on front (+z), deep dish on back (-z)
  // The mold sits over an ear so the inside is much deeper than the outside is tall.
  let z;
  if (v <= 0.5) {
    const t = v / 0.5;            // 0 (peak) → 1 (rim)
    z = 0.32 * Math.cos(t * Math.PI / 2);
  } else {
    const t = (v - 0.5) / 0.5;    // 0 (rim) → 1 (deepest)
    // slight bias so the back is asymmetric vs front
    z = -0.62 * Math.sin(t * Math.PI / 2);
  }

  // raised rim — silicone molds usually flare out a bit at the edge
  const rimBoost = Math.exp(-Math.pow((v - 0.5) * 14, 2));
  const radialAdj = radial * (1 + 0.06 * rimBoost);

  // tilt the whole shape slightly forward so when rotating you see the dish
  target.set(bx * radialAdj, by * radialAdj, z);
}

function buildMoldGeometry() {
  const geo = new ParametricGeometry(moldSurface, 160, 80);
  geo.computeVertexNormals();
  return geo;
}

// ---------- scene -----------------------------------------------------------
export function mountEarMold({ canvas, scrollContainer, autoRotate = false }) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = null;

  // PMREM environment — gives nice studio reflections through the silicone
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new RoomEnvironment(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(0, 0.05, 5.2);
  camera.lookAt(0, 0, 0);

  // lights — discreet, the env handles most of it
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(2.5, 3, 2);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x9fc3ff, 0.6);
  rim.position.set(-3, 1.5, -2);
  scene.add(rim);

  const fill = new THREE.DirectionalLight(0xffe9c8, 0.35);
  fill.position.set(-1.5, -1, 2);
  scene.add(fill);

  scene.add(new THREE.AmbientLight(0xffffff, 0.15));


  // ---------- the mold itself ----------------------------------------------
  const moldGeo = buildMoldGeometry();

  // soft silicone — slight tint, transmissive, IOR ~1.41 like medical silicone
  const moldMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xf0f6ff),
    metalness: 0.0,
    roughness: 0.18,
    transmission: 1.0,
    thickness: 0.55,
    ior: 1.41,
    attenuationColor: new THREE.Color(0xd6e2f3),
    attenuationDistance: 2.5,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    sheen: 0.4,
    sheenColor: new THREE.Color(0xffffff),
    sheenRoughness: 0.5,
    side: THREE.DoubleSide,
    transparent: true,
    envMapIntensity: 1.1,
  });

  const mold = new THREE.Mesh(moldGeo, moldMat);
  // tilt: front face toward viewer, slight up-tilt so dish is visible while rotating
  mold.rotation.x = -0.08;
  scene.add(mold);

  // a soft inner highlight: thin "ridge" mesh around the rim for that glossy edge
  const ridgeMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.05,
    transmission: 0.85,
    thickness: 0.2,
    ior: 1.42,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
  });
  const ridgeGeo = new THREE.TorusGeometry(1.0, 0.04, 24, 200);
  ridgeGeo.scale(0.95, 1.22, 1.0);
  const ridge = new THREE.Mesh(ridgeGeo, ridgeMat);
  ridge.position.z = 0.02;
  mold.add(ridge);

  // pedestal shadow (a soft dark disc on the floor below) — disabled for transparent bg
  // const shadowTex = makeRadialGradientTexture();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.001, 0.001),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.55;
  scene.add(shadow);

  // pedestal disc disabled — keep mold floating against transparent background
  const disc = new THREE.Mesh(
    new THREE.PlaneGeometry(0.001, 0.001),
    new THREE.MeshBasicMaterial({ visible: false }),
  );

  // ---------- resize handling ---------------------------------------------
  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  // ---------- rotation driver ---------------------------------------------
  // Scroll-driven primary; a tiny idle drift keeps it alive when scroll is parked.
  let scrollProgress = 0;
  let target = 0;
  let current = 0;

  function computeScroll() {
    if (!scrollContainer) return;
    const rect = scrollContainer.getBoundingClientRect();
    const total = scrollContainer.offsetHeight - window.innerHeight;
    if (total <= 0) {
      scrollProgress = 0;
      return;
    }
    const scrolled = -rect.top;
    scrollProgress = Math.max(0, Math.min(1, scrolled / total));
  }

  let raf = 0;
  const clock = new THREE.Clock();

  function tick() {
    raf = requestAnimationFrame(tick);
    computeScroll();

    const dt = clock.getDelta();
    const idle = autoRotate ? (clock.elapsedTime * 0.18) : 0;
    target = scrollProgress * Math.PI * 2 + idle;
    // damped follow
    current += (target - current) * Math.min(1, dt * 6);

    mold.rotation.y = current;
    ridge.rotation.y = 0; // ridge is child of mold, follows automatically

    // gentle bob
    mold.position.y = Math.sin(clock.elapsedTime * 0.6) * 0.02;

    renderer.render(scene, camera);
  }
  tick();

  return {
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      moldGeo.dispose();
      moldMat.dispose();
      pmrem.dispose();
    },
    setProgress(p) {
      scrollProgress = Math.max(0, Math.min(1, p));
    },
  };
}

// ---------- helpers --------------------------------------------------------
function makeBackdropTexture() {
  const w = 1024, h = 640;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  // page-matching soft gradient (top: pale, bottom: cooler periwinkle)
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#f5f7fb');
  g.addColorStop(0.5, '#e9eef8');
  g.addColorStop(1, '#dbe4f4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // soft center glow so the mold reads with a halo behind it
  const r = ctx.createRadialGradient(w/2, h*0.55, 0, w/2, h*0.55, h*0.6);
  r.addColorStop(0, 'rgba(255,255,255,0.6)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRadialGradientTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(20, 30, 60, 0.55)');
  g.addColorStop(0.55, 'rgba(20, 30, 60, 0.2)');
  g.addColorStop(1.0, 'rgba(20, 30, 60, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
