'use strict';

const T = require('./teacher');

function mulberry32(a) {
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N_PN = 648;
const N_KC = 5177;
const KC_FANIN = 7;
const N_MBON = 96;
const N_COMP = 4;
const MBON_PER_COMP = 24;
const WINDOW = 9;
const RADIUS = 4;
const PN_MY = 3;
const PN_OPP = 3;
const PN_OFF = 2;
const PN_PER_SPATIAL = PN_MY + PN_OPP + PN_OFF;
const TARGET_SPARSITY = 0.075;
const CLASS_WEIGHT = [1e6, 1e4, 1e2, 1];

function pnIndex(cell, state, k) {
  const base = cell * PN_PER_SPATIAL;
  if (state === 0) return base + k;
  if (state === 1) return base + PN_MY + k;
  return base + PN_MY + PN_OPP + k;
}

function assertDisjointPnChannels() {
  const owner = new Int8Array(N_PN);
  owner.fill(-1);
  for (let cell = 0; cell < WINDOW * WINDOW; cell++) {
    for (let k = 0; k < PN_MY; k++) {
      const p = pnIndex(cell, 0, k);
      if (owner[p] !== -1) throw new Error('PN channel overlap at ' + p);
      owner[p] = 0;
    }
    for (let k = 0; k < PN_OPP; k++) {
      const p = pnIndex(cell, 1, k);
      if (owner[p] !== -1) throw new Error('PN channel overlap at ' + p);
      owner[p] = 1;
    }
    for (let k = 0; k < PN_OFF; k++) {
      const p = pnIndex(cell, 2, k);
      if (owner[p] !== -1) throw new Error('PN channel overlap at ' + p);
      owner[p] = 2;
    }
  }
  for (let p = 0; p < N_PN; p++) {
    if (owner[p] < 0) throw new Error('unassigned PN ' + p);
  }
}

assertDisjointPnChannels();

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
      while (used[p] === stamp && guard++ < 16) {
        p = (rng() * N_PN) | 0;
      }
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

function createBrain(opts) {
  const seed = (opts && opts.seed) != null ? opts.seed : 1;
  const rng = mulberry32(seed);
  const { proj, inv, offsets } = buildProjection(rng);
  const w = new Float32Array(N_KC * N_MBON);
  const wComp = new Float32Array(N_KC * N_COMP);
  const wMax = (opts && opts.wMax) != null ? opts.wMax : 1;
  const init = wMax * 0.5;
  const jitter = wMax * 0.02;
  for (let i = 0; i < w.length; i++) w[i] = init + (rng() - 0.5) * jitter;
  for (let k = 0; k < N_KC; k++) {
    for (let c = 0; c < N_COMP; c++) {
      let s = 0;
      const mb = k * N_MBON + c * MBON_PER_COMP;
      for (let j = 0; j < MBON_PER_COMP; j++) s += w[mb + j];
      wComp[k * N_COMP + c] = s;
    }
  }

  return {
    proj,
    inv,
    offsets,
    w,
    wComp,
    wMax,
    lr: (opts && opts.lr) != null ? opts.lr : 0.02,
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
    pred: T.NEUTRAL,
    myCount: 0,
    oppCount: 0,
  };
}

function setPn(pn, active, nActive, p) {
  if (pn[p]) return nActive;
  pn[p] = 1;
  active[nActive] = p;
  return nActive + 1;
}

function encode(board, row, col, player, pn, active) {
  pn.fill(0);
  let nActive = 0;
  let myCount = 0;
  let oppCount = 0;
  const opp = T.opponent(player);
  const act = active || null;
  for (let dr = -RADIUS; dr <= RADIUS; dr++) {
    for (let dc = -RADIUS; dc <= RADIUS; dc++) {
      const r = row + dr;
      const c = col + dc;
      const cell = (dr + RADIUS) * WINDOW + (dc + RADIUS);
      if (r < 0 || r >= T.SIZE || c < 0 || c >= T.SIZE) {
        const p = pnIndex(cell, 2, 0);
        if (act) nActive = setPn(pn, act, nActive, p);
        else pn[p] = 1;
        continue;
      }
      const v = board[T.idx(r, c)];
      if (v === player) {
        myCount++;
        for (let k = 0; k < PN_MY; k++) {
          const p = pnIndex(cell, 0, k);
          if (act) nActive = setPn(pn, act, nActive, p);
          else pn[p] = 1;
        }
      } else if (v === opp) {
        oppCount++;
        for (let k = 0; k < PN_OPP; k++) {
          const p = pnIndex(cell, 1, k);
          if (act) nActive = setPn(pn, act, nActive, p);
          else pn[p] = 1;
        }
      }
    }
  }
  return { nActive, myCount, oppCount };
}

function compartmentMeans(mbonDrive, drive) {
  for (let c = 0; c < N_COMP; c++) {
    let s = 0;
    const b = c * MBON_PER_COMP;
    for (let j = 0; j < MBON_PER_COMP; j++) s += mbonDrive[b + j];
    drive[c] = s / MBON_PER_COMP;
  }
}

function classFromDrive(drive, nFire, tieMargin) {
  if (nFire === 0) return T.NEUTRAL;
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
  if (!(second - minV > tieMargin)) return T.NEUTRAL;
  return minC;
}

function fillMbonDrive(brain) {
  const { firing, nFire, hits, w, mbonDrive, drive } = brain;
  mbonDrive.fill(0);
  for (let i = 0; i < nFire; i++) {
    const k = firing[i];
    const h = hits[k];
    const wb = k * N_MBON;
    for (let j = 0; j < N_MBON; j++) mbonDrive[j] += w[wb + j] * h;
  }
  compartmentMeans(mbonDrive, drive);
}

function forward(brain) {
  const { hits, inv, offsets, firing, wComp, drive, threshold, active } = brain;
  const nAct = brain.nActive;
  if (active && nAct === 0) {
    mbonSilent(brain);
    return T.NEUTRAL;
  }
  hits.fill(0);
  if (active) {
    for (let a = 0; a < nAct; a++) {
      const p = active[a];
      const lo = offsets[p];
      const hi = offsets[p + 1];
      for (let i = lo; i < hi; i++) hits[inv[i]]++;
    }
  } else {
    const { pn } = brain;
    for (let p = 0; p < N_PN; p++) {
      if (pn[p] === 0) continue;
      const lo = offsets[p];
      const hi = offsets[p + 1];
      for (let i = lo; i < hi; i++) hits[inv[i]]++;
    }
  }
  let nFire = 0;
  for (let k = 0; k < N_KC; k++) {
    if (hits[k] >= threshold) firing[nFire++] = k;
  }
  brain.nFire = nFire;
  drive[0] = 0;
  drive[1] = 0;
  drive[2] = 0;
  drive[3] = 0;
  if (nFire === 0) {
    brain.mbonDrive.fill(0);
    brain.pred = T.NEUTRAL;
    return T.NEUTRAL;
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
  if (pred === T.WIN && brain.myCount < 4) pred = T.GOOD;
  if (pred === T.BLOCK && brain.oppCount < 3) pred = T.GOOD;
  brain.pred = pred;
  return pred;
}

function mbonSilent(brain) {
  brain.nFire = 0;
  brain.drive[0] = 0;
  brain.drive[1] = 0;
  brain.drive[2] = 0;
  brain.drive[3] = 0;
  brain.pred = T.NEUTRAL;
}

function learn(brain, pred, label) {
  if (pred === label) return false;
  const { w, wComp, firing, nFire, lr, wMax } = brain;
  if (nFire === 0) return false;
  const step = lr / MBON_PER_COMP;
  for (let i = 0; i < nFire; i++) {
    const k = firing[i];
    const wb = k * N_MBON;
    const correct = wb + label * MBON_PER_COMP;
    const wrong = wb + pred * MBON_PER_COMP;
    for (let j = 0; j < MBON_PER_COMP; j++) {
      const d = w[correct + j] - step;
      w[correct + j] = d < 0 ? 0 : d;
      const p = w[wrong + j] + step;
      w[wrong + j] = p > wMax ? wMax : p;
    }
    let sc = 0;
    let sw = 0;
    for (let j = 0; j < MBON_PER_COMP; j++) {
      sc += w[correct + j];
      sw += w[wrong + j];
    }
    const cb = k * N_COMP;
    wComp[cb + label] = sc;
    wComp[cb + pred] = sw;
  }
  return true;
}

function saturatedFraction(brain) {
  const { w, wMax } = brain;
  let n = 0;
  for (let i = 0; i < w.length; i++) {
    if (w[i] <= 0 || w[i] >= wMax) n++;
  }
  return n / w.length;
}

function sparsityOf(brain) {
  return brain.nFire / N_KC;
}

function marginOf(brain) {
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
  if (second === Infinity) return 0;
  return second - minV;
}

function scoreMove(brain, pred, r, c) {
  const conf = marginOf(brain);
  const dist = Math.abs(r - 7) + Math.abs(c - 7);
  return CLASS_WEIGHT[pred] + conf * 10 - dist;
}

function pickMove(brain, board, player, rad) {
  const cands = T.listCandidates(board, rad == null ? 2 : rad);
  let bestI = cands[0];
  let bestS = -1e300;
  const cells = [];
  for (let k = 0; k < cands.length; k++) {
    const i = cands[k];
    const r = (i / T.SIZE) | 0;
    const c = i - r * T.SIZE;
    const enc = encode(board, r, c, player, brain.pn, brain.active);
    brain.nActive = enc.nActive;
    brain.myCount = enc.myCount;
    brain.oppCount = enc.oppCount;
    const pred = forward(brain);
    const score = scoreMove(brain, pred, r, c);
    cells.push({
      i,
      r,
      c,
      pred,
      score,
      drive: [brain.drive[0], brain.drive[1], brain.drive[2], brain.drive[3]],
      nFire: brain.nFire,
    });
    if (score > bestS) {
      bestS = score;
      bestI = i;
    }
  }
  return { index: bestI, cells };
}

function exportState(brain) {
  fillMbonDrive(brain);
  const firing = new Uint16Array(brain.nFire);
  for (let i = 0; i < brain.nFire; i++) firing[i] = brain.firing[i];
  return {
    pred: brain.pred,
    nFire: brain.nFire,
    firing,
    mbonDrive: Float64Array.from(brain.mbonDrive),
    drive: Float64Array.from(brain.drive),
  };
}

function loadWeights(brain, w) {
  if (w.length !== brain.w.length) throw new Error('weight length mismatch');
  brain.w.set(w);
  for (let k = 0; k < N_KC; k++) {
    for (let c = 0; c < N_COMP; c++) {
      let s = 0;
      const mb = k * N_MBON + c * MBON_PER_COMP;
      for (let j = 0; j < MBON_PER_COMP; j++) s += w[mb + j];
      brain.wComp[k * N_COMP + c] = s;
    }
  }
}

module.exports = {
  N_PN,
  N_KC,
  KC_FANIN,
  N_MBON,
  N_COMP,
  MBON_PER_COMP,
  PN_MY,
  PN_OPP,
  PN_OFF,
  PN_PER_SPATIAL,
  TARGET_SPARSITY,
  CLASS_WEIGHT,
  WINDOW,
  RADIUS,
  pnIndex,
  assertDisjointPnChannels,
  createBrain,
  encode,
  forward,
  learn,
  classFromDrive,
  compartmentMeans,
  saturatedFraction,
  sparsityOf,
  marginOf,
  scoreMove,
  pickMove,
  exportState,
  fillMbonDrive,
  loadWeights,
  mulberry32,
};
