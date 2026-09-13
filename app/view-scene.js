import * as THREE from './vendor/three.module.min.js';
import { SIZE, EMPTY, P1, P2, idx } from './board.js';

const STEP = 0.74;
const ORIGIN = (SIZE - 1) / 2;
const TAU = Math.PI * 2;

export function gridToWorld(r, c) {
  return { x: (c - ORIGIN) * STEP, z: (r - ORIGIN) * STEP };
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function ease(t) {
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
}
function approach(v, to, dt, tau) {
  return v + (to - v) * (1 - Math.exp(-dt / Math.max(1e-4, tau)));
}
function rnd(a, b) {
  return a + Math.random() * (b - a);
}

function woodTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#c4a06a';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 48; i++) {
    const y = i * 11 + Math.sin(i) * 4;
    g.strokeStyle = 'rgba(90,55,22,' + (0.04 + (i % 5) * 0.015) + ')';
    g.lineWidth = 2 + (i % 3);
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 16) g.lineTo(x, y + Math.sin(x * 0.04 + i) * 3);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeFly() {
  const root = new THREE.Group();
  const cuticle = new THREE.MeshStandardMaterial({
    color: 0x2c241c,
    roughness: 0.48,
    metalness: 0.12,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x16120e, roughness: 0.55 });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x7a1818,
    roughness: 0.22,
    metalness: 0.25,
    emissive: 0x2a0404,
  });
  const wingMat = new THREE.MeshStandardMaterial({
    color: 0xd5e0d0,
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
    roughness: 0.35,
    depthWrite: false,
  });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x3a3228, roughness: 0.6 });

  const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 14), cuticle);
  thorax.scale.set(1.15, 0.85, 0.95);
  root.add(thorax);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), cuticle);
  head.position.set(0.2, 0.02, 0);
  head.scale.set(0.95, 0.9, 1.05);
  root.add(head);

  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 12), eyeMat);
    eye.position.set(0.24, 0.04, s * 0.08);
    eye.scale.set(0.85, 0.95, 1.15);
    root.add(eye);
    const ant = new THREE.Group();
    const a0 = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, 0.14, 6), dark);
    a0.rotation.z = 0.9;
    a0.position.set(0.07, 0.06, 0);
    const a1 = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.12, 6), dark);
    a1.position.set(0, 0.12, 0);
    a1.rotation.z = 0.4;
    ant.add(a0, a1);
    ant.position.set(0.26, 0.08, s * 0.04);
    ant.rotation.y = s * 0.35;
    root.add(ant);
    ant.userData.side = s;
  }

  const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), dark);
  abdomen.position.set(-0.26, -0.02, 0);
  abdomen.scale.set(1.35, 0.72, 0.78);
  root.add(abdomen);

  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.18), wingMat);
    w.position.set(-0.02, 0.12, s * 0.12);
    w.rotation.y = s * 0.35;
    w.rotation.z = -0.2;
    root.add(w);
    wings.push(w);
  }

  const legs = [];
  const layout = [
    { name: 'lf', x: 0.12, z: 0.1, rest: [0.22, -0.22, 0.16] },
    { name: 'rf', x: 0.12, z: -0.1, rest: [0.22, -0.22, -0.16] },
    { name: 'lm', x: 0.0, z: 0.12, rest: [0.02, -0.24, 0.22] },
    { name: 'rm', x: 0.0, z: -0.12, rest: [0.02, -0.24, -0.22] },
    { name: 'lh', x: -0.12, z: 0.1, rest: [-0.2, -0.22, 0.18] },
    { name: 'rh', x: -0.12, z: -0.1, rest: [-0.2, -0.22, -0.18] },
  ];
  for (const L of layout) {
    const hip = new THREE.Group();
    hip.position.set(L.x, -0.04, L.z);
    const femur = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.01, 0.16, 6), legMat);
    femur.geometry.translate(0, -0.08, 0);
    const tibia = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.007, 0.16, 6), legMat);
    tibia.geometry.translate(0, -0.08, 0);
    tibia.position.y = -0.16;
    femur.add(tibia);
    hip.add(femur);
    root.add(hip);
    legs.push({ name: L.name, hip, femur, tibia, rest: L.rest, side: L.z >= 0 ? 1 : -1 });
  }

  root.userData = { wings, legs, head };
  return root;
}

function poseLeg(leg, tgt, lift) {
  const dx = tgt[0] - leg.hip.position.x;
  const dy = tgt[1] - leg.hip.position.y;
  const dz = tgt[2] - leg.hip.position.z;
  const yaw = Math.atan2(dz, dx);
  const dist = Math.hypot(dx, dy, dz);
  const l1 = 0.16;
  const l2 = 0.16;
  const d = clamp(dist, 0.04, l1 + l2 - 0.01);
  const elbow = Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
  const shoulder = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const pitch = Math.atan2(dy, Math.hypot(dx, dz)) - shoulder;
  leg.hip.rotation.set(0, -yaw + Math.PI / 2, 0);
  leg.femur.rotation.set(pitch + (lift || 0), 0, 0);
  leg.tibia.rotation.set(Math.PI - elbow, 0, 0);
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x0d1014, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0d1014, 14, 28);
  scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x1a1510, 1.15));
  const sun = new THREE.DirectionalLight(0xfff1dd, 1.8);
  sun.position.set(-6, 10, 6);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x59b7ff, 0.35);
  rim.position.set(8, 4, -4);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
  camera.position.set(0, 9.2, 10.4);
  camera.lookAt(0, 0, 0.4);

  const boardGroup = new THREE.Group();
  const boardSize = STEP * (SIZE - 1) + 1.15;
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(boardSize, 0.16, boardSize),
    new THREE.MeshStandardMaterial({
      color: 0xd0b07a,
      map: woodTexture(),
      roughness: 0.72,
      metalness: 0.02,
    })
  );
  top.position.y = -0.08;
  boardGroup.add(top);
  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(boardSize + 0.18, 0.22, boardSize + 0.18),
    new THREE.MeshStandardMaterial({ color: 0x5a3d22, roughness: 0.8 })
  );
  edge.position.y = -0.2;
  boardGroup.add(edge);

  const lineMat = new THREE.LineBasicMaterial({ color: 0x3a2a18 });
  const pts = [];
  const half = ((SIZE - 1) * STEP) / 2;
  for (let i = 0; i < SIZE; i++) {
    const p = -half + i * STEP;
    pts.push(new THREE.Vector3(-half, 0.005, p), new THREE.Vector3(half, 0.005, p));
    pts.push(new THREE.Vector3(p, 0.005, -half), new THREE.Vector3(p, 0.005, half));
  }
  boardGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  const starGeo = new THREE.SphereGeometry(0.035, 10, 8);
  const starMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18 });
  for (const [r, c] of [
    [3, 3],
    [3, 11],
    [11, 3],
    [11, 11],
    [7, 7],
  ]) {
    const s = new THREE.Mesh(starGeo, starMat);
    const w = gridToWorld(r, c);
    s.position.set(w.x, 0.01, w.z);
    boardGroup.add(s);
  }
  scene.add(boardGroup);

  const stoneGeo = new THREE.SphereGeometry(0.22, 20, 14);
  const blackMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.28,
    metalness: 0.15,
  });
  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xf3efe6,
    roughness: 0.35,
    metalness: 0.05,
  });
  const stones = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    const m = new THREE.Mesh(stoneGeo, blackMat);
    m.scale.set(1, 0.62, 1);
    m.visible = false;
    scene.add(m);
    stones.push(m);
  }

  const heatGeo = new THREE.CircleGeometry(0.28, 20);
  heatGeo.rotateX(-Math.PI / 2);
  const heats = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffb454,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const m = new THREE.Mesh(heatGeo, mat);
    const r = (i / SIZE) | 0;
    const c = i - r * SIZE;
    const w = gridToWorld(r, c);
    m.position.set(w.x, 0.02, w.z);
    scene.add(m);
    heats.push({ mesh: m, mat, target: 0 });
  }

  const hoverRing = new THREE.Mesh(
    new THREE.RingGeometry(0.18, 0.24, 24),
    new THREE.MeshBasicMaterial({ color: 0x59b7ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  );
  hoverRing.rotation.x = -Math.PI / 2;
  hoverRing.position.y = 0.03;
  hoverRing.visible = false;
  scene.add(hoverRing);

  const fly = makeFly();
  fly.position.set(0, 0.34, 0);
  fly.scale.setScalar(1.45);
  scene.add(fly);

  const food = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 18, 12),
    new THREE.MeshPhysicalMaterial({
      color: 0xe9c46a,
      roughness: 0.18,
      transmission: 0.25,
      thickness: 0.4,
      clearcoat: 0.8,
    })
  );
  food.scale.set(1, 0.55, 1);
  food.visible = false;
  scene.add(food);

  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const pointer = new THREE.Vector2();

  let boardState = new Uint8Array(SIZE * SIZE);
  let lastMove = -1;
  let hover = null;
  let reduced = false;
  let mode = 'idle';
  let t = 0;
  let lastTs = 0;
  let walk = null;
  let thinkT = 0;
  let flap = 0;
  let yaw = 0;
  let onArrive = null;
  let placeT = 0;

  function resize() {
    const wrap = canvas.parentElement;
    const w = Math.max(280, wrap.clientWidth);
    const phone = matchMedia('(max-width: 640px)').matches;
    const h = phone
      ? Math.round(clamp(innerHeight * 0.46, 260, 480))
      : Math.round(clamp(w * 0.78, 320, 620));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function setBoard(board, last) {
    boardState = board;
    lastMove = last;
    for (let i = 0; i < stones.length; i++) {
      const v = board[i];
      const m = stones[i];
      if (!v) {
        m.visible = false;
        continue;
      }
      const r = (i / SIZE) | 0;
      const c = i - r * SIZE;
      const w = gridToWorld(r, c);
      m.visible = true;
      m.material = v === P1 ? blackMat : whiteMat;
      m.position.set(w.x, 0.14, w.z);
      m.scale.setScalar(i === lastMove ? 1.06 : 1);
      m.scale.y = 0.62;
    }
  }

  function setHeat(cells) {
    for (let i = 0; i < heats.length; i++) heats[i].target = 0;
    let max = 1e-6;
    const glow = new Float32Array(SIZE * SIZE);
    for (let k = 0; k < cells.length; k++) {
      const cell = cells[k];
      const g = cell.pred === 3 ? 0 : 3 - cell.pred + Math.min(1, cell.score / 1e4);
      glow[cell.i] = g;
      if (g > max) max = g;
    }
    for (let i = 0; i < heats.length; i++) {
      heats[i].target = boardState[i] === EMPTY ? glow[i] / max : 0;
    }
  }

  function cellAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    const c = Math.round(hit.x / STEP + ORIGIN);
    const r = Math.round(hit.z / STEP + ORIGIN);
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null;
    return { r, c, i: idx(r, c) };
  }

  function setHover(cell) {
    hover = cell;
    if (!cell) {
      hoverRing.visible = false;
      return;
    }
    const w = gridToWorld(cell.r, cell.c);
    hoverRing.visible = true;
    hoverRing.position.set(w.x, 0.03, w.z);
  }

  function goTo(r, c, cb) {
    const w = gridToWorld(r, c);
    if (reduced) {
      fly.position.x = w.x;
      fly.position.z = w.z;
      mode = 'place';
      placeT = 0;
      onArrive = cb;
      return;
    }
    walk = {
      x0: fly.position.x,
      z0: fly.position.z,
      x1: w.x,
      z1: w.z,
      u: 0,
    };
    yaw = Math.atan2(w.x - fly.position.x, w.z - fly.position.z);
    mode = 'walk';
    onArrive = cb;
  }

  function setThink(on) {
    mode = on ? 'think' : mode === 'think' ? 'idle' : mode;
    thinkT = 0;
  }

  function celebrate(ok) {
    mode = ok ? 'feed' : 'sulk';
    thinkT = 0;
    if (ok) {
      food.position.set(fly.position.x + 0.55, 0.08, fly.position.z + 0.2);
      food.visible = true;
    } else food.visible = false;
  }

  function resetPose() {
    fly.position.set(0, 0.34, 0);
    yaw = 0.4;
    mode = 'idle';
    walk = null;
    food.visible = false;
    flap = 0;
  }

  function poseWalk(phase, liftScale) {
    const legs = fly.userData.legs;
    for (let i = 0; i < legs.length; i++) {
      const L = legs[i];
      const ph = phase + (i % 2 ? Math.PI : 0) + (L.name[1] === 'm' ? 0.6 : 0);
      const lift = Math.max(0, Math.sin(ph)) * 0.12 * liftScale;
      const stride = Math.cos(ph) * 0.06 * liftScale;
      poseLeg(L, [L.rest[0] + stride, L.rest[1] + lift, L.rest[2]], 0);
    }
  }

  function poseIdle(tt) {
    poseWalk(tt * 1.2, 0.15);
    const lf = fly.userData.legs[0];
    const groom = Math.max(0, Math.sin(tt * 0.7) - 0.65) * 4;
    if (groom > 0) poseLeg(lf, [0.12, 0.08 + 0.06 * Math.sin(tt * 8), 0.08], 0.4 * groom);
  }

  function loop(ts) {
    requestAnimationFrame(loop);
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    t += dt;

    for (let i = 0; i < heats.length; i++) {
      const h = heats[i];
      const o = h.mat.opacity;
      const want = 0.08 + 0.55 * h.target;
      h.mat.opacity = approach(o, h.target > 0.04 ? want : 0, dt, 0.12);
      h.mesh.visible = h.mat.opacity > 0.01;
    }

    const wantFlap = mode === 'think' ? 0.85 : mode === 'walk' ? 0.15 : 0.05;
    flap = approach(flap, reduced ? 0 : wantFlap, dt, 0.12);
    const wings = fly.userData.wings;
    for (let i = 0; i < wings.length; i++) {
      const s = i ? 1 : -1;
      wings[i].rotation.x = Math.sin(t * 40) * 0.55 * flap;
      wings[i].rotation.z = -0.2 + s * 0.15 * flap;
    }
    fly.userData.head.rotation.y = Math.sin(t * (mode === 'think' ? 8 : 1.4)) * (mode === 'think' ? 0.25 : 0.08);

    if (mode === 'walk' && walk) {
      walk.u = Math.min(1, walk.u + dt / Math.max(0.35, Math.hypot(walk.x1 - walk.x0, walk.z1 - walk.z0) * 0.45));
      const u = ease(walk.u);
      fly.position.x = lerp(walk.x0, walk.x1, u);
      fly.position.z = lerp(walk.z0, walk.z1, u);
      yaw = Math.atan2(walk.x1 - walk.x0, walk.z1 - walk.z0);
      poseWalk(t * 14, 1);
      if (walk.u >= 1) {
        walk = null;
        mode = 'place';
        placeT = 0;
      }
    } else if (mode === 'place') {
      placeT += dt;
      const dip = Math.sin(Math.min(1, placeT / 0.28) * Math.PI);
      poseWalk(0, 0.1);
      poseLeg(fly.userData.legs[0], [0.28, -0.32 + 0.1 * (1 - dip), 0.02], 0.2);
      if (placeT > 0.32 && onArrive) {
        const fn = onArrive;
        onArrive = null;
        fn();
        mode = 'idle';
      }
    } else if (mode === 'think') {
      thinkT += dt;
      fly.position.x = Math.sin(thinkT * 0.9) * 1.05;
      fly.position.z = Math.cos(thinkT * 0.7) * 1.05;
      yaw = thinkT * 0.9;
      poseWalk(t * 16, 0.85);
    } else if (mode === 'feed') {
      thinkT += dt;
      poseIdle(t);
      fly.userData.head.rotation.x = 0.45;
      if (thinkT > 2.4) {
        food.visible = false;
        mode = 'idle';
      }
    } else if (mode === 'sulk') {
      thinkT += dt;
      poseIdle(t * 1.4);
      poseLeg(fly.userData.legs[0], [0.1, 0.1, 0.06], 0.5);
      if (thinkT > 1.8) mode = 'idle';
    } else {
      poseIdle(t);
    }

    fly.rotation.y = yaw;
    fly.position.y = 0.34 + Math.sin(t * 2.2) * 0.012;

    const look = new THREE.Vector3(fly.position.x * 0.25, 0, fly.position.z * 0.25);
    camera.position.x = approach(camera.position.x, look.x, dt, 0.8);
    camera.position.z = approach(camera.position.z, 10.4 + look.z * 0.2, dt, 0.8);
    camera.lookAt(look.x, 0.15, look.z + 0.3);

    renderer.render(scene, camera);
  }

  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(loop);

  return {
    setBoard,
    setHeat,
    setHover,
    cellAt,
    goTo,
    setThink,
    celebrate,
    resetPose,
    setReduced(v) {
      reduced = v;
    },
    getFlap() {
      return flap;
    },
    resize,
  };
}
