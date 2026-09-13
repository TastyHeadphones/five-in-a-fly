'use strict';

const SIZE = 15;
const N = SIZE * SIZE;
const EMPTY = 0;
const P1 = 1;
const P2 = 2;

const WIN = 0;
const BLOCK = 1;
const GOOD = 2;
const NEUTRAL = 3;

const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

function inBoard(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

function idx(r, c) {
  return r * SIZE + c;
}

function emptyBoard() {
  return new Uint8Array(N);
}

function cloneBoard(board) {
  return new Uint8Array(board);
}

function opponent(player) {
  return player ^ 3;
}

function countRun(board, r, c, dr, dc, player) {
  let n = 1;
  for (let s = 1; s < 5; s++) {
    const rr = r + dr * s;
    const cc = c + dc * s;
    if (!inBoard(rr, cc) || board[idx(rr, cc)] !== player) break;
    n++;
  }
  for (let s = 1; s < 5; s++) {
    const rr = r - dr * s;
    const cc = c - dc * s;
    if (!inBoard(rr, cc) || board[idx(rr, cc)] !== player) break;
    n++;
  }
  return n;
}

function wouldMakeFive(board, r, c, player) {
  for (let d = 0; d < 4; d++) {
    const [dr, dc] = DIRS[d];
    if (countRun(board, r, c, dr, dc, player) >= 5) return true;
  }
  return false;
}

function maxFiveWindow(board, r, c, player) {
  const opp = opponent(player);
  let best = 0;
  for (let d = 0; d < 4; d++) {
    const [dr, dc] = DIRS[d];
    for (let i = 0; i < 5; i++) {
      let stones = 0;
      let ok = true;
      for (let k = 0; k < 5; k++) {
        const rr = r + dr * (k - i);
        const cc = c + dc * (k - i);
        if (!inBoard(rr, cc)) {
          ok = false;
          break;
        }
        const v = rr === r && cc === c ? player : board[idx(rr, cc)];
        if (v === opp) {
          ok = false;
          break;
        }
        if (v === player) stones++;
      }
      if (ok && stones > best) best = stones;
    }
  }
  return best;
}

function countFiveThreatsThrough(board, r, c, player) {
  let n = 0;
  for (let d = 0; d < 4; d++) {
    const [dr, dc] = DIRS[d];
    for (let s = -4; s <= 4; s++) {
      if (s === 0) continue;
      const rr = r + dr * s;
      const cc = c + dc * s;
      if (!inBoard(rr, cc) || board[idx(rr, cc)] !== EMPTY) continue;
      if (wouldMakeFive(board, rr, cc, player)) n++;
    }
  }
  return n;
}

function wouldMakeOpenFour(board, r, c, player) {
  const i = idx(r, c);
  board[i] = player;
  const threats = countFiveThreatsThrough(board, r, c, player);
  board[i] = EMPTY;
  return threats >= 2;
}

function classifySquare(board, r, c, player) {
  if (board[idx(r, c)] !== EMPTY) return null;
  if (wouldMakeFive(board, r, c, player)) return WIN;
  const opp = opponent(player);
  if (wouldMakeFive(board, r, c, opp) || wouldMakeOpenFour(board, r, c, opp)) {
    return BLOCK;
  }
  if (maxFiveWindow(board, r, c, player) >= 3 || maxFiveWindow(board, r, c, opp) >= 3) {
    return GOOD;
  }
  return NEUTRAL;
}

function classifyAll(board, player) {
  const out = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[idx(r, c)] !== EMPTY) continue;
      out.push({ r, c, label: classifySquare(board, r, c, player) });
    }
  }
  return out;
}

function nearStone(board, r, c, rad) {
  const loR = r - rad < 0 ? 0 : r - rad;
  const hiR = r + rad >= SIZE ? SIZE - 1 : r + rad;
  const loC = c - rad < 0 ? 0 : c - rad;
  const hiC = c + rad >= SIZE ? SIZE - 1 : c + rad;
  for (let rr = loR; rr <= hiR; rr++) {
    for (let cc = loC; cc <= hiC; cc++) {
      if (board[idx(rr, cc)] !== EMPTY) return true;
    }
  }
  return false;
}

function listEmpty(board) {
  const out = [];
  for (let i = 0; i < N; i++) if (board[i] === EMPTY) out.push(i);
  return out;
}

function listCandidates(board, rad) {
  const empties = listEmpty(board);
  const near = [];
  for (let k = 0; k < empties.length; k++) {
    const i = empties[k];
    const r = (i / SIZE) | 0;
    const c = i - r * SIZE;
    if (nearStone(board, r, c, rad)) near.push(i);
  }
  return near.length ? near : empties;
}

function moveScore(label, r, c, rng) {
  return (3 - label) * 10000 - (Math.abs(r - 7) + Math.abs(c - 7)) * 10 + rng() * 4;
}

function pickTeacherMove(board, player, rng, noise) {
  const empties = listEmpty(board);
  if (empties.length === 0) return null;
  const pNoise = noise == null ? 0.12 : noise;
  if (rng() < pNoise) {
    const pool = listCandidates(board, 2);
    return pool[(rng() * pool.length) | 0];
  }
  let bestI = empties[0];
  let bestS = -1e15;
  for (let k = 0; k < empties.length; k++) {
    const i = empties[k];
    const r = (i / SIZE) | 0;
    const c = i - r * SIZE;
    const label = classifySquare(board, r, c, player);
    const s = moveScore(label, r, c, rng);
    if (s > bestS) {
      bestS = s;
      bestI = i;
    }
  }
  return bestI;
}

function applyMove(board, i, player) {
  board[i] = player;
}

function winnerAfter(board, i, player) {
  const r = (i / SIZE) | 0;
  const c = i - r * SIZE;
  return wouldMakeFive(board, r, c, player) || countRun(board, r, c, 0, 1, player) >= 5;
}

function makesFiveAt(board, i, player) {
  const r = (i / SIZE) | 0;
  const c = i - r * SIZE;
  for (let d = 0; d < 4; d++) {
    const [dr, dc] = DIRS[d];
    if (countRun(board, r, c, dr, dc, player) >= 5) return true;
  }
  return false;
}

module.exports = {
  SIZE,
  N,
  EMPTY,
  P1,
  P2,
  WIN,
  BLOCK,
  GOOD,
  NEUTRAL,
  DIRS,
  inBoard,
  idx,
  emptyBoard,
  cloneBoard,
  opponent,
  countRun,
  wouldMakeFive,
  wouldMakeOpenFour,
  maxFiveWindow,
  classifySquare,
  classifyAll,
  nearStone,
  listEmpty,
  listCandidates,
  pickTeacherMove,
  applyMove,
  winnerAfter,
  makesFiveAt,
};
