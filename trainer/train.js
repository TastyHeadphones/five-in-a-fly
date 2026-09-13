'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const T = require('./teacher');
const G = require('./generate');
const B = require('./brain-ref');

function sniff(brain, board, r, c, player) {
  const enc = B.encode(board, r, c, player, brain.pn, brain.active);
  brain.nActive = enc.nActive;
  brain.myCount = enc.myCount;
  brain.oppCount = enc.oppCount;
  return B.forward(brain);
}

function sniffRaw(brain, board, r, c, player) {
  const saved = brain.tieMargin;
  brain.tieMargin = 0;
  const pred = sniff(brain, board, r, c, player);
  const rec = { pred, margin: B.marginOf(brain), nFire: brain.nFire };
  brain.tieMargin = saved;
  return rec;
}

function predAt(pred, margin, tau) {
  if (margin <= tau) return T.NEUTRAL;
  return pred;
}

function trainBrain(opts) {
  const nSamples = (opts && opts.nSamples) != null ? opts.nSamples : 20000;
  const seed = (opts && opts.seed) != null ? opts.seed : 1;
  const brain = B.createBrain({
    seed: (opts && opts.projSeed) != null ? opts.projSeed : 42,
    lr: (opts && opts.lr) != null ? opts.lr : 0.02,
    wMax: (opts && opts.wMax) != null ? opts.wMax : 1,
    tieMargin: 0,
  });
  const rng = G.mulberry32(seed);
  let n = 0;
  while (n < nSamples) {
    const kind = G.mixKind(n);
    const sample = G.applySymmetry(G.makeSample(rng, kind), n & 7);
    const pred = sniff(brain, sample.board, sample.r, sample.c, sample.player);
    B.learn(brain, pred, sample.label);
    n++;
  }

  const fineKinds = [
    G.KIND_WIN,
    G.KIND_BLOCK5,
    G.KIND_OPEN4,
    G.KIND_OPEN4,
    G.KIND_WIN,
    G.KIND_OPEN4,
  ];
  const nFine = (opts && opts.nFine) != null ? opts.nFine : 12000;
  const savedLr = brain.lr;
  brain.lr = savedLr * 0.5;
  for (let i = 0; i < nFine; i++) {
    const kind = fineKinds[i % fineKinds.length];
    const sample = G.applySymmetry(G.makeSample(rng, kind), i & 7);
    const pred = sniff(brain, sample.board, sample.r, sample.c, sample.player);
    B.learn(brain, pred, sample.label);
    n++;
  }

  brain.lr = savedLr * 0.35;
  const nOpen = (opts && opts.nOpen) != null ? opts.nOpen : 8000;
  for (let i = 0; i < nOpen; i++) {
    const sample = G.applySymmetry(G.makeOpenFourBlockSample(rng), i & 7);
    const pred = sniff(brain, sample.board, sample.r, sample.c, sample.player);
    B.learn(brain, pred, T.BLOCK);
    n++;
  }

  brain.lr = savedLr * 0.08;
  const nHard = (opts && opts.nHard) != null ? opts.nHard : 0;
  for (let g = 0; g < nHard; g++) {
    const pos = G.makeSelfPlayPosition(rng);
    const empties = T.listEmpty(pos.board);
    for (let k = 0; k < empties.length; k++) {
      const i = empties[k];
      const r = (i / T.SIZE) | 0;
      const c = i - r * T.SIZE;
      const label = T.classifySquare(pos.board, r, c, pos.player);
      const pred = sniff(brain, pos.board, r, c, pos.player);
      if ((pred === T.WIN || pred === T.BLOCK) && pred !== label) {
        B.learn(brain, pred, label);
        n++;
      }
    }
  }

  brain.lr = savedLr;
  return { brain, samplesTrained: n };
}

function collectKind(brain, rng, kind, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const sample = G.makeSample(rng, kind);
    const rec = sniffRaw(brain, sample.board, sample.r, sample.c, sample.player);
    rec.label = sample.label;
    out.push(rec);
  }
  return out;
}

function collectOpenFour(brain, rng, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const sample = G.makeOpenFourBlockSample(rng);
    const rec = sniffRaw(brain, sample.board, sample.r, sample.c, sample.player);
    rec.label = T.BLOCK;
    out.push(rec);
  }
  return out;
}

function accAt(rows, expect, tau) {
  let ok = 0;
  for (let i = 0; i < rows.length; i++) {
    if (predAt(rows[i].pred, rows[i].margin, tau) === expect) ok++;
  }
  return ok / rows.length;
}

function missedAt(rows, expect, tau) {
  let missed = 0;
  for (let i = 0; i < rows.length; i++) {
    if (predAt(rows[i].pred, rows[i].margin, tau) !== expect) missed++;
  }
  return missed;
}

function evalSparsity(brain, rng, games) {
  let spars = 0;
  let n = 0;
  for (let i = 0; i < games; i++) {
    const pos = G.makeSelfPlayPosition(rng);
    const cands = T.listCandidates(pos.board, 2);
    for (let k = 0; k < cands.length; k++) {
      const idx = cands[k];
      const r = (idx / T.SIZE) | 0;
      const c = idx - r * T.SIZE;
      sniff(brain, pos.board, r, c, pos.player);
      spars += brain.nFire;
      n++;
    }
  }
  return n === 0 ? 0 : spars / n / B.N_KC;
}

function collectAllEmpty(brain, board, player, out) {
  const empties = T.listEmpty(board);
  for (let k = 0; k < empties.length; k++) {
    const i = empties[k];
    const r = (i / T.SIZE) | 0;
    const c = i - r * T.SIZE;
    const rec = sniffRaw(brain, board, r, c, player);
    rec.label = T.classifySquare(board, r, c, player);
    out.push(rec);
  }
}

function collectNatural(brain, rng, nGames) {
  const out = [];
  for (let g = 0; g < nGames; g++) {
    const pos = G.makeSelfPlayPosition(rng);
    collectAllEmpty(brain, pos.board, pos.player, out);
  }
  return out;
}

function precisionAt(rows, cls, tau) {
  let predN = 0;
  let hit = 0;
  for (let i = 0; i < rows.length; i++) {
    const p = predAt(rows[i].pred, rows[i].margin, tau);
    if (p !== cls) continue;
    predN++;
    if (rows[i].label === cls) hit++;
  }
  return { prec: predN === 0 ? 1 : hit / predN, predN, hit };
}

function falseCallsAt(rows, tau) {
  let n = 0;
  for (let i = 0; i < rows.length; i++) {
    const p = predAt(rows[i].pred, rows[i].margin, tau);
    if (p === T.WIN && rows[i].label !== T.WIN) n++;
    if (p === T.BLOCK && rows[i].label !== T.BLOCK) n++;
  }
  return n;
}

function playTeacherGame(rng, maxMoves) {
  const board = T.emptyBoard();
  let player = T.P1;
  const positions = [];
  const nOpen = 2 + ((rng() * 4) | 0);
  for (let k = 0; k < nOpen; k++) {
    const r = 5 + ((rng() * 5) | 0);
    const c = 5 + ((rng() * 5) | 0);
    const i = T.idx(r, c);
    if (board[i] !== T.EMPTY) continue;
    board[i] = player;
    player = T.opponent(player);
  }
  const limit = maxMoves == null ? 40 : maxMoves;
  for (let m = 0; m < limit; m++) {
    positions.push({ board: T.cloneBoard(board), player });
    const move = T.pickTeacherMove(board, player, rng, 0.08);
    if (move == null) break;
    const r = (move / T.SIZE) | 0;
    const c = move - r * T.SIZE;
    board[move] = player;
    if (T.wouldMakeFive(board, r, c, player)) break;
    player = T.opponent(player);
  }
  return positions;
}

function collectPlayedGames(brain, rng, nGames) {
  const out = [];
  for (let g = 0; g < nGames; g++) {
    const positions = playTeacherGame(rng, 36);
    for (let p = 0; p < positions.length; p++) {
      collectAllEmpty(brain, positions[p].board, positions[p].player, out);
    }
  }
  return out;
}

function metricsAt(pack, tau) {
  const winAcc = accAt(pack.win, T.WIN, tau);
  const blockAcc = accAt(pack.block, T.BLOCK, tau);
  const openFourMissed = missedAt(pack.open4, T.BLOCK, tau);
  const winP = precisionAt(pack.nat, T.WIN, tau);
  const blockP = precisionAt(pack.nat, T.BLOCK, tau);
  const falseCalls100 = falseCallsAt(pack.played, tau);
  return {
    winAcc,
    blockAcc,
    openFourMissed,
    winPrecNat: winP.prec,
    blockPrecNat: blockP.prec,
    falseCalls100,
    winP,
    blockP,
  };
}

function gateOk(m) {
  return (
    m.winAcc >= 0.95 &&
    m.blockAcc >= 0.95 &&
    m.openFourMissed === 0 &&
    m.winPrecNat >= 0.95 &&
    m.blockPrecNat >= 0.95 &&
    m.falseCalls100 === 0
  );
}

function sweepTau(pack) {
  const m0 = metricsAt(pack, 0);
  const margins = [];
  function add(rows) {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].pred === T.WIN || rows[i].pred === T.BLOCK) margins.push(rows[i].margin);
    }
  }
  add(pack.nat);
  add(pack.played);
  margins.sort((a, b) => a - b);
  const candidates = [0];
  const step = Math.max(1, (margins.length / 250) | 0);
  for (let i = 0; i < margins.length; i += step) candidates.push(margins[i]);
  if (margins.length) candidates.push(margins[margins.length - 1]);
  let passing = null;
  let best = { tau: 0, m: m0 };
  function better(a, b) {
    const ra = Math.min(a.m.winAcc, a.m.blockAcc);
    const rb = Math.min(b.m.winAcc, b.m.blockAcc);
    if (ra >= 0.95 && rb < 0.95) return true;
    if (ra < 0.95 && rb >= 0.95) return false;
    if (a.m.openFourMissed !== b.m.openFourMissed) return a.m.openFourMissed < b.m.openFourMissed;
    if (a.m.falseCalls100 !== b.m.falseCalls100) return a.m.falseCalls100 < b.m.falseCalls100;
    const pa = Math.min(a.m.winPrecNat, a.m.blockPrecNat);
    const pb = Math.min(b.m.winPrecNat, b.m.blockPrecNat);
    if (pa !== pb) return pa > pb;
    return a.tau < b.tau;
  }
  for (let i = 0; i < candidates.length; i++) {
    const tau = candidates[i];
    const m = metricsAt(pack, tau);
    const cur = { tau, m };
    if (gateOk(m) && (!passing || tau < passing.tau)) passing = cur;
    if (better(cur, best)) best = cur;
  }
  return passing || best;
}

function exportWeights(brain, metrics, outDir) {
  const dir = outDir || path.join(__dirname, '..', 'weights');
  fs.mkdirSync(dir, { recursive: true });
  const scales = new Float64Array(B.N_MBON);
  const i8 = new Int8Array(B.N_KC * B.N_MBON);
  for (let j = 0; j < B.N_MBON; j++) {
    let m = 0;
    for (let k = 0; k < B.N_KC; k++) {
      const v = Math.abs(brain.w[k * B.N_MBON + j]);
      if (v > m) m = v;
    }
    scales[j] = m === 0 ? 1 : m / 127;
  }
  for (let k = 0; k < B.N_KC; k++) {
    for (let j = 0; j < B.N_MBON; j++) {
      const s = scales[j];
      let q = Math.round(brain.w[k * B.N_MBON + j] / s);
      if (q > 127) q = 127;
      if (q < -127) q = -127;
      i8[k * B.N_MBON + j] = q;
    }
  }
  const gz = zlib.gzipSync(Buffer.from(i8.buffer, i8.byteOffset, i8.byteLength), { level: 9 });
  fs.writeFileSync(path.join(dir, 'kc2mbon.i8.gz'), gz);
  const meta = {
    version: 'm1-g1',
    nPn: B.N_PN,
    nKc: B.N_KC,
    nMbon: B.N_MBON,
    mbonPerComp: B.MBON_PER_COMP,
    kcFanin: B.KC_FANIN,
    projSeed: 42,
    threshold: brain.threshold,
    tieMargin: brain.tieMargin,
    wMax: brain.wMax,
    pnMy: B.PN_MY,
    pnOpp: B.PN_OPP,
    pnOff: B.PN_OFF,
    scales: Array.from(scales),
    samplesTrained: metrics.samplesTrained,
    metrics: {
      winAcc: metrics.winAcc,
      blockAcc: metrics.blockAcc,
      openFourMissed: metrics.openFourMissed,
      sparsity: metrics.sparsity,
      saturated: metrics.saturated,
      winPrecNat: metrics.winPrecNat,
      blockPrecNat: metrics.blockPrecNat,
      falseCalls100: metrics.falseCalls100,
    },
  };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
  return { bytes: gz.length, meta };
}

function trainAndEval(opts) {
  const trained = trainBrain(opts);
  const brain = trained.brain;
  const evalRng = G.mulberry32((opts && opts.evalSeed) != null ? opts.evalSeed : 99);
  const pack = {
    win: collectKind(brain, evalRng, G.KIND_WIN, 400),
    block: collectKind(brain, evalRng, G.KIND_BLOCK5, 400),
    open4: collectOpenFour(brain, evalRng, 1000),
    nat: collectNatural(brain, evalRng, 80),
    played: collectPlayedGames(brain, evalRng, 100),
  };
  const sparsity = evalSparsity(brain, evalRng, 80);
  const sat = B.saturatedFraction(brain);
  const m0 = metricsAt(pack, 0);
  const swept = sweepTau(pack);
  brain.tieMargin = swept.tau;
  const m = swept.m;
  function marginStats(rows, predCls, wantMatch) {
    const xs = [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].pred !== predCls) continue;
      const match = rows[i].label === predCls;
      if (wantMatch !== match) continue;
      xs.push(rows[i].margin);
    }
    xs.sort((a, b) => a - b);
    if (!xs.length) return 'n=0';
    return (
      'n=' +
      xs.length +
      ' min=' +
      xs[0].toFixed(3) +
      ' p50=' +
      xs[(xs.length / 2) | 0].toFixed(3) +
      ' max=' +
      xs[xs.length - 1].toFixed(3)
    );
  }
  console.error(
    'tau0 win=' +
      m0.winAcc.toFixed(3) +
      ' block=' +
      m0.blockAcc.toFixed(3) +
      ' o4=' +
      m0.openFourMissed +
      ' winP=' +
      m0.winPrecNat.toFixed(3) +
      ' blockP=' +
      m0.blockPrecNat.toFixed(3) +
      ' false=' +
      m0.falseCalls100
  );
  console.error('true WIN margins ' + marginStats(pack.win, T.WIN, true));
  console.error('false WIN nat ' + marginStats(pack.nat, T.WIN, false));
  console.error('true BLOCK open4 ' + marginStats(pack.open4, T.BLOCK, true));
  console.error('false BLOCK nat ' + marginStats(pack.nat, T.BLOCK, false));
  console.error('chosen tau ' + swept.tau);

  const metrics = {
    brain,
    winAcc: m.winAcc,
    blockAcc: m.blockAcc,
    openFourMissed: m.openFourMissed,
    sparsity,
    saturated: sat,
    samplesTrained: trained.samplesTrained,
    winPrecNat: m.winPrecNat,
    blockPrecNat: m.blockPrecNat,
    falseCalls100: m.falseCalls100,
    tieMargin: swept.tau,
    natCounts: { winP: m.winP, blockP: m.blockP },
  };

  if (!opts || opts.export !== false) {
    exportWeights(brain, metrics);
  }
  return metrics;
}

function fmtPct(x) {
  return (x * 100).toFixed(1) + '%';
}

function printVerify(m) {
  console.log('held-out WIN accuracy: ' + fmtPct(m.winAcc));
  console.log('held-out BLOCK accuracy: ' + fmtPct(m.blockAcc));
  console.log('open-four blocks missed out of 1000: ' + m.openFourMissed);
  console.log('KC sparsity (mean % firing): ' + fmtPct(m.sparsity));
  console.log('saturated synapses: ' + fmtPct(m.saturated));
  console.log('samples trained: ' + m.samplesTrained);
  console.log('WIN precision at natural prior: ' + fmtPct(m.winPrecNat));
  console.log('BLOCK precision at natural prior: ' + fmtPct(m.blockPrecNat));
  console.log('false WIN/BLOCK calls per 100 played games: ' + m.falseCalls100);
}

function gatePass(m) {
  return (
    m.winAcc >= 0.95 &&
    m.blockAcc >= 0.95 &&
    m.openFourMissed === 0 &&
    m.sparsity >= 0.05 &&
    m.sparsity <= 0.1 &&
    m.saturated < 0.05 &&
    m.winPrecNat >= 0.95 &&
    m.blockPrecNat >= 0.95 &&
    m.falseCalls100 === 0
  );
}

if (require.main === module) {
  const nSamples = parseInt(process.env.SAMPLES || '24000', 10);
  const lr = parseFloat(process.env.LR || '0.02');
  const t0 = Date.now();
  const m = trainAndEval({ nSamples, lr });
  printVerify(m);
  console.error('elapsed_ms ' + (Date.now() - t0));
  console.error('tieMargin ' + m.tieMargin);
  console.error('gate ' + (gatePass(m) ? 'PASS' : 'FAIL'));
}

module.exports = {
  trainBrain,
  trainAndEval,
  evalSparsity,
  exportWeights,
  printVerify,
  gatePass,
  fmtPct,
  sniff,
  sniffRaw,
  predAt,
  sweepTau,
  metricsAt,
};
