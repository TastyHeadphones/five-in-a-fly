'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const T = require('./teacher');
const G = require('./generate');
const B = require('./brain-ref');

function loadBrain() {
  const dir = path.join(__dirname, '..', 'weights');
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  const gz = fs.readFileSync(path.join(dir, 'kc2mbon.i8.gz'));
  const raw = zlib.gunzipSync(gz);
  const i8 = new Int8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  const brain = B.createBrain({
    seed: meta.projSeed,
    threshold: meta.threshold,
    tieMargin: meta.tieMargin,
  });
  const w = new Float32Array(B.N_KC * B.N_MBON);
  for (let k = 0; k < B.N_KC; k++) {
    for (let j = 0; j < B.N_MBON; j++) w[k * B.N_MBON + j] = i8[k * B.N_MBON + j] * meta.scales[j];
  }
  B.loadWeights(brain, w);
  brain.tieMargin = meta.tieMargin;
  return brain;
}

function sniff(brain, board, r, c, player) {
  const enc = B.encode(board, r, c, player, brain.pn, brain.active);
  brain.nActive = enc.nActive;
  brain.myCount = enc.myCount;
  brain.oppCount = enc.oppCount;
  return B.forward(brain);
}

function forcedMove(board, player) {
  const empties = T.listEmpty(board);
  const opp = T.opponent(player);
  for (let k = 0; k < empties.length; k++) {
    const i = empties[k];
    const r = (i / T.SIZE) | 0;
    const c = i - r * T.SIZE;
    if (T.wouldMakeFive(board, r, c, player)) return i;
  }
  for (let k = 0; k < empties.length; k++) {
    const i = empties[k];
    const r = (i / T.SIZE) | 0;
    const c = i - r * T.SIZE;
    if (T.wouldMakeFive(board, r, c, opp)) return i;
  }
  for (let k = 0; k < empties.length; k++) {
    const i = empties[k];
    const r = (i / T.SIZE) | 0;
    const c = i - r * T.SIZE;
    if (T.wouldMakeOpenFour(board, r, c, opp)) return i;
  }
  return null;
}

function flyMove(brain, board, player) {
  const forced = forcedMove(board, player);
  if (forced != null) return { i: forced, reason: 'forced' };
  const cands = T.listCandidates(board, 2);
  let bestI = cands[0];
  let bestS = -1e300;
  for (let k = 0; k < cands.length; k++) {
    const i = cands[k];
    const r = (i / T.SIZE) | 0;
    const c = i - r * T.SIZE;
    const pred = sniff(brain, board, r, c, player);
    const rank = pred === T.WIN ? T.GOOD : pred;
    const s = B.CLASS_WEIGHT[rank] + B.marginOf(brain) * 10 - (Math.abs(r - 7) + Math.abs(c - 7));
    if (s > bestS) {
      bestS = s;
      bestI = i;
    }
  }
  return { i: bestI, reason: 'mb' };
}

function randomMove(board, rng) {
  const pool = T.listCandidates(board, 2);
  return pool[(rng() * pool.length) | 0];
}

function playGame(brain, rng, vsTeacher) {
  const board = T.emptyBoard();
  let player = T.P1;
  let farWhileThreat = false;
  let missedOpenFour = false;
  let flyWon = false;
  let oppWon = false;
  for (let m = 0; m < 225; m++) {
    let i;
    if (player === T.P2) {
      const threat = T.listEmpty(board).some((idx) => {
        const r = (idx / T.SIZE) | 0;
        const c = idx - r * T.SIZE;
        return (
          T.wouldMakeFive(board, r, c, T.P1) ||
          T.wouldMakeOpenFour(board, r, c, T.P1)
        );
      });
      const mv = flyMove(brain, board, T.P2);
      i = mv.i;
      const r = (i / T.SIZE) | 0;
      const c = i - r * T.SIZE;
      if (threat && !T.nearStone(board, r, c, 2)) farWhileThreat = true;
      const openNeed = T.listEmpty(board).filter((idx) => {
        const rr = (idx / T.SIZE) | 0;
        const cc = idx - rr * T.SIZE;
        return T.wouldMakeOpenFour(board, rr, cc, T.P1);
      });
      if (openNeed.length && openNeed.indexOf(i) < 0) {
        const still = openNeed.some((idx) => {
          const rr = (idx / T.SIZE) | 0;
          const cc = idx - rr * T.SIZE;
          return T.wouldMakeOpenFour(board, rr, cc, T.P1);
        });
        if (still && !T.wouldMakeFive(board, r, c, T.P2) && !T.wouldMakeFive(board, r, c, T.P1)) {
          missedOpenFour = true;
        }
      }
    } else if (vsTeacher) {
      i = T.pickTeacherMove(board, player, rng, 0.05);
    } else {
      i = randomMove(board, rng);
    }
    if (i == null) break;
    const r = (i / T.SIZE) | 0;
    const c = i - r * T.SIZE;
    board[i] = player;
    if (T.wouldMakeFive(board, r, c, player)) {
      if (player === T.P2) flyWon = true;
      else oppWon = true;
      break;
    }
    player = T.opponent(player);
  }
  return { farWhileThreat, missedOpenFour, flyWon, oppWon };
}

function run(n) {
  const brain = loadBrain();
  const rng = G.mulberry32(123);
  let far = 0;
  let miss = 0;
  let winR = 0;
  let winT = 0;
  for (let g = 0; g < n; g++) {
    const a = playGame(brain, rng, false);
    if (a.farWhileThreat) far++;
    if (a.missedOpenFour) miss++;
    if (a.flyWon) winR++;
  }
  for (let g = 0; g < n; g++) {
    const a = playGame(brain, rng, true);
    if (a.farWhileThreat) far++;
    if (a.missedOpenFour) miss++;
    if (a.flyWon) winT++;
  }
  console.log('games vs random: ' + n);
  console.log('games vs teacher: ' + n);
  console.log('far-from-stone while threat existed: ' + far);
  console.log('open-four blocks missed: ' + miss);
  console.log('win rate vs random: ' + ((100 * winR) / n).toFixed(1) + '%');
  console.log('win rate vs teacher: ' + ((100 * winT) / n).toFixed(1) + '%');
  return { far, miss, winR, winT };
}

if (require.main === module) run(parseInt(process.env.GAMES || '200', 10));

module.exports = { run, flyMove, loadBrain };
