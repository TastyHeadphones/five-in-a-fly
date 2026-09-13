import {
  SIZE,
  WIN,
  BLOCK,
  GOOD,
  NEUTRAL,
  idx,
  listCandidates,
  listEmpty,
} from './board.js';
import {
  N_PN,
  N_KC,
  KC_FANIN,
  N_MBON,
  N_COMP,
  MBON_PER_COMP,
  CLASS_WEIGHT,
  encode,
} from './encode.js';

export {
  N_PN,
  N_KC,
  KC_FANIN,
  N_MBON,
  N_COMP,
  MBON_PER_COMP,
  encode,
} from './encode.js';

function mulberry32(a) {
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildProjection(rng) {
  const proj = new Uint16Array(N_KC * KC_FANIN);
  const used = new Uint8Array(N_PN);
  let stamp = 1;
  for (let k = 0; k < N_KC; k++) {
    if (stamp === 255) {
      used.fill(0);
      stamp = 1;
    }
    const base = k * KC_FANIN;
    for (let i = 0; i < KC_FANIN; i++) {
      let p = (rng() * N_PN) | 0;
      let guard = 0;
      while (used[p] === stamp && guard++ < 16) p = (rng() * N_PN) | 0;
      if (used[p] === stamp) {
        for (p = 0; p < N_PN; p++) if (used[p] !== stamp) break;
      }
      used[p] = stamp;
      proj[base + i] = p;
    }
    stamp++;
  }
  const counts = new Uint16Array(N_PN);
  for (let i = 0; i < proj.length; i++) counts[proj[i]]++;
  const offsets = new Uint32Array(N_PN + 1);
  for (let p = 0; p < N_PN; p++) offsets[p + 1] = offsets[p] + counts[p];
  const inv = new Uint16Array(proj.length);
  const cursor = new Uint32Array(N_PN);
  for (let p = 0; p < N_PN; p++) cursor[p] = offsets[p];
  for (let k = 0; k < N_KC; k++) {
    const base = k * KC_FANIN;
    for (let i = 0; i < KC_FANIN; i++) {
      const p = proj[base + i];
      inv[cursor[p]++] = k;
    }
  }
  return { proj, inv, offsets };
}

export function createBrain(opts) {
  const seed = (opts && opts.seed) != null ? opts.seed : 42;
  const rng = mulberry32(seed);
  const { proj, inv, offsets } = buildProjection(rng);
  return {
    proj,
    inv,
    offsets,
    w: new Float32Array(N_KC * N_MBON),
    wComp: new Float32Array(N_KC * N_COMP),
    scales: new Float32Array(N_MBON),
    pn: new Uint8Array(N_PN),
    active: new Uint16Array(N_PN),
    nActive: 0,
    hits: new Uint8Array(N_KC),
    firing: new Uint16Array(N_KC),
    mbonDrive: new Float64Array(N_MBON),
    drive: new Float64Array(N_COMP),
    threshold: (opts && opts.threshold) != null ? opts.threshold : 2,
    tieMargin: (opts && opts.tieMargin) != null ? opts.tieMargin : 0,
    nFire: 0,
    pred: NEUTRAL,
    myCount: 0,
    oppCount: 0,
  };
}

function rebuildComp(brain) {
  const { w, wComp } = brain;
  for (let k = 0; k < N_KC; k++) {
    for (let c = 0; c < N_COMP; c++) {
      let s = 0;
      const mb = k * N_MBON + c * MBON_PER_COMP;
      for (let j = 0; j < MBON_PER_COMP; j++) s += w[mb + j];
      wComp[k * N_COMP + c] = s;
    }
  }
}

export function loadInt8Weights(brain, i8, scales) {
  if (i8.length !== N_KC * N_MBON) throw new Error('weight length mismatch');
  for (let j = 0; j < N_MBON; j++) brain.scales[j] = scales[j];
  for (let k = 0; k < N_KC; k++) {
    for (let j = 0; j < N_MBON; j++) {
      brain.w[k * N_MBON + j] = i8[k * N_MBON + j] * scales[j];
    }
  }
  rebuildComp(brain);
}

function classFromDrive(drive, nFire, tieMargin) {
  if (nFire === 0) return NEUTRAL;
  let minC = 0;
  let minV = drive[0];
  let second = Infinity;
  for (let c = 1; c < N_COMP; c++) {
    const v = drive[c];
    if (v < minV) {
      second = minV;
      minV = v;
      minC = c;
    } else if (v < second) {
      second = v;
    }
  }
  if (!(second - minV > tieMargin)) return NEUTRAL;
  return minC;
}

export function forward(brain) {
  const { hits, inv, offsets, firing, wComp, drive, threshold, active } = brain;
  const nAct = brain.nActive;
  if (active && nAct === 0) {
    brain.nFire = 0;
    drive[0] = drive[1] = drive[2] = drive[3] = 0;
    brain.pred = NEUTRAL;
    return NEUTRAL;
  }
  hits.fill(0);
  for (let a = 0; a < nAct; a++) {
    const p = active[a];
    const lo = offsets[p];
    const hi = offsets[p + 1];
    for (let i = lo; i < hi; i++) hits[inv[i]]++;
  }
  let nFire = 0;
  for (let k = 0; k < N_KC; k++) {
    if (hits[k] >= threshold) firing[nFire++] = k;
  }
  brain.nFire = nFire;
  drive[0] = drive[1] = drive[2] = drive[3] = 0;
  if (nFire === 0) {
    brain.pred = NEUTRAL;
    return NEUTRAL;
  }
  for (let i = 0; i < nFire; i++) {
    const k = firing[i];
    const h = hits[k];
    const b = k * N_COMP;
    drive[0] += wComp[b] * h;
    drive[1] += wComp[b + 1] * h;
    drive[2] += wComp[b + 2] * h;
    drive[3] += wComp[b + 3] * h;
  }
  drive[0] /= MBON_PER_COMP;
  drive[1] /= MBON_PER_COMP;
  drive[2] /= MBON_PER_COMP;
  drive[3] /= MBON_PER_COMP;
  let pred = classFromDrive(drive, nFire, brain.tieMargin);
  if (pred === WIN && brain.myCount < 4) pred = GOOD;
  if (pred === BLOCK && brain.oppCount < 3) pred = GOOD;
  brain.pred = pred;
  return pred;
}

export function fillMbonDrive(brain) {
  const { firing, nFire, hits, w, mbonDrive } = brain;
  mbonDrive.fill(0);
  for (let i = 0; i < nFire; i++) {
    const k = firing[i];
    const h = hits[k];
    const wb = k * N_MBON;
    for (let j = 0; j < N_MBON; j++) mbonDrive[j] += w[wb + j] * h;
  }
}

export function sniff(brain, board, r, c, player) {
  const enc = encode(board, r, c, player, brain.pn, brain.active);
  brain.nActive = enc.nActive;
  brain.myCount = enc.myCount;
  brain.oppCount = enc.oppCount;
  return forward(brain);
}

export function marginOf(brain) {
  const d = brain.drive;
  let minV = d[0];
  let second = Infinity;
  for (let c = 1; c < N_COMP; c++) {
    const v = d[c];
    if (v < minV) {
      second = minV;
      minV = v;
    } else if (v < second) {
      second = v;
    }
  }
  return second === Infinity ? 0 : second - minV;
}

export function scoreMove(brain, pred, r, c) {
  const rank = pred === WIN ? GOOD : pred;
  const conf = marginOf(brain);
  const dist = Math.abs(r - 7) + Math.abs(c - 7);
  return CLASS_WEIGHT[rank] + conf * 10 - dist;
}

export function scoreBoard(brain, board, player) {
  const empties = listEmpty(board);
  const cells = [];
  for (let k = 0; k < empties.length; k++) {
    const i = empties[k];
    const r = (i / SIZE) | 0;
    const c = i - r * SIZE;
    const pred = sniff(brain, board, r, c, player);
    cells.push({
      i,
      r,
      c,
      pred,
      score: scoreMove(brain, pred, r, c),
      drive: [brain.drive[0], brain.drive[1], brain.drive[2], brain.drive[3]],
      nFire: brain.nFire,
    });
  }
  return cells;
}

export function pickFromScores(board, cells, rad) {
  const allow = new Set(listCandidates(board, rad == null ? 2 : rad));
  let bestI = -1;
  let bestS = -1e300;
  for (let k = 0; k < cells.length; k++) {
    const cell = cells[k];
    if (!allow.has(cell.i)) continue;
    if (cell.score > bestS) {
      bestS = cell.score;
      bestI = cell.i;
    }
  }
  if (bestI < 0 && cells.length) bestI = cells[0].i;
  return bestI;
}

export function exportState(brain) {
  fillMbonDrive(brain);
  const firing = new Uint16Array(brain.nFire);
  for (let i = 0; i < brain.nFire; i++) firing[i] = brain.firing[i];
  return {
    pred: brain.pred,
    nFire: brain.nFire,
    firing,
    mbonDrive: Array.from(brain.mbonDrive),
    drive: [brain.drive[0], brain.drive[1], brain.drive[2], brain.drive[3]],
  };
}

export function kcSeedPositions(seed) {
  const rng = mulberry32(seed == null ? 7 : seed);
  const xy = new Int16Array(N_KC * 2);
  for (let k = 0; k < N_KC; k++) {
    const t = rng() * Math.PI * 2;
    const rad = Math.sqrt(rng()) * 32000;
    xy[k * 2] = Math.round(Math.cos(t) * rad);
    xy[k * 2 + 1] = Math.round(Math.sin(t) * rad * 0.62);
  }
  return xy;
}
