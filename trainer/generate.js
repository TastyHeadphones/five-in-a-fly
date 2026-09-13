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

function transformRC(r, c, kind) {
  const n = T.SIZE;
  switch (kind) {
    case 0:
      return [r, c];
    case 1:
      return [c, n - 1 - r];
    case 2:
      return [n - 1 - r, n - 1 - c];
    case 3:
      return [n - 1 - c, r];
    case 4:
      return [r, n - 1 - c];
    case 5:
      return [n - 1 - r, c];
    case 6:
      return [c, r];
    case 7:
      return [n - 1 - c, n - 1 - r];
    default:
      return [r, c];
  }
}

function transformBoard(board, kind) {
  const out = T.emptyBoard();
  for (let r = 0; r < T.SIZE; r++) {
    for (let c = 0; c < T.SIZE; c++) {
      const [rr, cc] = transformRC(r, c, kind);
      out[T.idx(rr, cc)] = board[T.idx(r, c)];
    }
  }
  return out;
}

function applySymmetry(sample, kind) {
  const [r, c] = transformRC(sample.r, sample.c, kind);
  return {
    board: transformBoard(sample.board, kind),
    r,
    c,
    player: sample.player,
    label: sample.label,
  };
}

function allSymmetries(sample) {
  const out = new Array(8);
  for (let k = 0; k < 8; k++) out[k] = applySymmetry(sample, k);
  return out;
}

function randInt(rng, n) {
  return (rng() * n) | 0;
}

function randomPlayer(rng) {
  return rng() < 0.5 ? T.P1 : T.P2;
}

function randomDir(rng) {
  return T.DIRS[randInt(rng, 4)];
}

function randomLineStart(rng, dr, dc, len) {
  for (let t = 0; t < 80; t++) {
    const r = randInt(rng, T.SIZE);
    const c = randInt(rng, T.SIZE);
    const r2 = r + dr * (len - 1);
    const c2 = c + dc * (len - 1);
    if (T.inBoard(r2, c2)) return [r, c];
  }
  if (dr === 0 && dc === 1) return [7, 4];
  if (dr === 1 && dc === 0) return [4, 7];
  if (dr === 1 && dc === 1) return [4, 4];
  return [4, 10];
}

function lineOnBoard(r, c, dr, dc, len) {
  const cells = new Array(len);
  for (let i = 0; i < len; i++) cells[i] = [r + dr * i, c + dc * i];
  return cells;
}

function reservedSet(cells) {
  const s = new Set();
  for (let i = 0; i < cells.length; i++) s.add(T.idx(cells[i][0], cells[i][1]));
  return s;
}

function addClutter(board, rng, reserved, n, player) {
  let placed = 0;
  let tries = 0;
  const opp = T.opponent(player);
  while (placed < n && tries < n * 20 + 40) {
    tries++;
    const i = randInt(rng, T.N);
    if (board[i] !== T.EMPTY || reserved.has(i)) continue;
    const who = rng() < 0.5 ? player : opp;
    board[i] = who;
    const r = (i / T.SIZE) | 0;
    const c = i - r * T.SIZE;
    let five = false;
    for (let d = 0; d < 4; d++) {
      const [dr, dc] = T.DIRS[d];
      if (T.countRun(board, r, c, dr, dc, who) >= 5) {
        five = true;
        break;
      }
    }
    if (five) {
      board[i] = T.EMPTY;
      continue;
    }
    placed++;
  }
}

function sampleOk(board, r, c, player, want) {
  if (!T.inBoard(r, c) || board[T.idx(r, c)] !== T.EMPTY) return false;
  return T.classifySquare(board, r, c, player) === want;
}

function isEdgeSquare(r, c) {
  return r <= 3 || r >= T.SIZE - 4 || c <= 3 || c >= T.SIZE - 4;
}

function makeWinSample(rng) {
  const wantEdge = rng() < 0.55;
  for (let t = 0; t < 80; t++) {
    const board = T.emptyBoard();
    const player = randomPlayer(rng);
    const [dr, dc] = randomDir(rng);
    const [sr, sc] = randomLineStart(rng, dr, dc, 5);
    const cells = lineOnBoard(sr, sc, dr, dc, 5);
    const gap = randInt(rng, 5);
    const r = cells[gap][0];
    const c = cells[gap][1];
    if (wantEdge !== isEdgeSquare(r, c) && t < 50) continue;
    for (let i = 0; i < 5; i++) {
      if (i === gap) continue;
      board[T.idx(cells[i][0], cells[i][1])] = player;
    }
    const reserved = reservedSet(cells);
    addClutter(board, rng, reserved, 3 + randInt(rng, 8), player);
    if (sampleOk(board, r, c, player, T.WIN)) {
      return { board, r, c, player, label: T.WIN };
    }
  }
  const board = T.emptyBoard();
  for (let i = 0; i < 4; i++) board[T.idx(7, 5 + i)] = T.P1;
  return { board, r: 7, c: 9, player: T.P1, label: T.WIN };
}

function makeBlockFiveSample(rng) {
  for (let t = 0; t < 80; t++) {
    const board = T.emptyBoard();
    const player = randomPlayer(rng);
    const opp = T.opponent(player);
    const [dr, dc] = randomDir(rng);
    const [sr, sc] = randomLineStart(rng, dr, dc, 5);
    const cells = lineOnBoard(sr, sc, dr, dc, 5);
    const gap = randInt(rng, 5);
    for (let i = 0; i < 5; i++) {
      if (i === gap) continue;
      board[T.idx(cells[i][0], cells[i][1])] = opp;
    }
    const r = cells[gap][0];
    const c = cells[gap][1];
    const reserved = reservedSet(cells);
    addClutter(board, rng, reserved, 4 + randInt(rng, 8), player);
    if (sampleOk(board, r, c, player, T.BLOCK)) {
      return { board, r, c, player, label: T.BLOCK };
    }
  }
  const board = T.emptyBoard();
  for (let i = 0; i < 4; i++) board[T.idx(7, 5 + i)] = T.P2;
  return { board, r: 7, c: 9, player: T.P1, label: T.BLOCK };
}

function makeOpenFourBlockSample(rng) {
  for (let t = 0; t < 120; t++) {
    const board = T.emptyBoard();
    const player = randomPlayer(rng);
    const opp = T.opponent(player);
    const [dr, dc] = randomDir(rng);
    const broken = rng() < 0.3;
    const len = broken ? 7 : 6;
    const [sr, sc] = randomLineStart(rng, dr, dc, len);
    const cells = lineOnBoard(sr, sc, dr, dc, len);
    let testAt;
    let stones;
    if (broken && cells.length === 7) {
      // _ O O _ O _  — playing the gap makes a live four.
      testAt = 3;
      stones = [1, 2, 4];
    } else {
      const mirror = rng() < 0.5;
      testAt = mirror ? 4 : 1;
      stones = mirror ? [1, 2, 3] : [2, 3, 4];
    }
    for (let k = 0; k < stones.length; k++) {
      board[T.idx(cells[stones[k]][0], cells[stones[k]][1])] = opp;
    }
    const r = cells[testAt][0];
    const c = cells[testAt][1];
    const reserved = reservedSet(cells);
    addClutter(board, rng, reserved, 3 + randInt(rng, 8), player);
    if (
      board[T.idx(r, c)] === T.EMPTY &&
      !T.wouldMakeFive(board, r, c, player) &&
      T.wouldMakeOpenFour(board, r, c, opp) &&
      T.classifySquare(board, r, c, player) === T.BLOCK
    ) {
      return { board, r, c, player, label: T.BLOCK };
    }
  }
  const board = T.emptyBoard();
  board[T.idx(7, 6)] = T.P2;
  board[T.idx(7, 7)] = T.P2;
  board[T.idx(7, 8)] = T.P2;
  return { board, r: 7, c: 5, player: T.P1, label: T.BLOCK };
}

function makeGoodSample(rng) {
  for (let t = 0; t < 80; t++) {
    const board = T.emptyBoard();
    const player = randomPlayer(rng);
    const [dr, dc] = randomDir(rng);
    const [sr, sc] = randomLineStart(rng, dr, dc, 4);
    const cells = lineOnBoard(sr, sc, dr, dc, 4);
    const gap = randInt(rng, 4);
    const who = rng() < 0.55 ? player : T.opponent(player);
    for (let i = 0; i < 4; i++) {
      if (i === gap) continue;
      board[T.idx(cells[i][0], cells[i][1])] = who;
    }
    const r = cells[gap][0];
    const c = cells[gap][1];
    const reserved = reservedSet(cells);
    addClutter(board, rng, reserved, 5 + randInt(rng, 9), player);
    if (sampleOk(board, r, c, player, T.GOOD)) {
      return { board, r, c, player, label: T.GOOD };
    }
  }
  const board = T.emptyBoard();
  board[T.idx(7, 6)] = T.P1;
  board[T.idx(7, 7)] = T.P1;
  return { board, r: 7, c: 8, player: T.P1, label: T.GOOD };
}

function makeNeutralSample(rng) {
  for (let t = 0; t < 80; t++) {
    const board = T.emptyBoard();
    const player = randomPlayer(rng);
    const nStones = 6 + randInt(rng, 12);
    addClutter(board, rng, new Set(), nStones, player);
    const empties = T.listEmpty(board);
    if (empties.length === 0) continue;
    for (let k = 0; k < 12; k++) {
      const i = empties[randInt(rng, empties.length)];
      const r = (i / T.SIZE) | 0;
      const c = i - r * T.SIZE;
      if (sampleOk(board, r, c, player, T.NEUTRAL)) {
        return { board, r, c, player, label: T.NEUTRAL };
      }
    }
  }
  const board = T.emptyBoard();
  board[T.idx(7, 7)] = T.P1;
  return { board, r: 0, c: 0, player: T.P2, label: T.NEUTRAL };
}

function randomOpening(board, rng) {
  const n = 2 + randInt(rng, 6);
  let player = T.P1;
  for (let k = 0; k < n; k++) {
    const r = 5 + randInt(rng, 5);
    const c = 5 + randInt(rng, 5);
    const i = T.idx(r, c);
    if (board[i] !== T.EMPTY) continue;
    board[i] = player;
    player = T.opponent(player);
  }
  return player;
}

function makeSelfPlayPosition(rng) {
  const board = T.emptyBoard();
  let player = randomOpening(board, rng);
  const maxMoves = 8 + randInt(rng, 22);
  for (let m = 0; m < maxMoves; m++) {
    const move = T.pickTeacherMove(board, player, rng, 0.18);
    if (move == null) break;
    const r = (move / T.SIZE) | 0;
    const c = move - r * T.SIZE;
    if (T.wouldMakeFive(board, r, c, player)) break;
    board[move] = player;
    player = T.opponent(player);
  }
  return { board, player };
}

function makeSelfPlaySample(rng) {
  for (let t = 0; t < 40; t++) {
    const { board, player } = makeSelfPlayPosition(rng);
    const labels = T.classifyAll(board, player);
    if (labels.length === 0) continue;
    let chosen = null;
    for (let k = 0; k < labels.length; k++) {
      if (labels[k].label === T.WIN) {
        chosen = labels[k];
        break;
      }
    }
    if (!chosen) {
      for (let k = 0; k < labels.length; k++) {
        if (labels[k].label === T.BLOCK) {
          chosen = labels[k];
          break;
        }
      }
    }
    if (!chosen) {
      const prefer = rng() < 0.45 ? T.GOOD : T.NEUTRAL;
      const pool = [];
      for (let k = 0; k < labels.length; k++) {
        if (labels[k].label === prefer) pool.push(labels[k]);
      }
      if (pool.length) chosen = pool[randInt(rng, pool.length)];
      else chosen = labels[randInt(rng, labels.length)];
    }
    return {
      board,
      r: chosen.r,
      c: chosen.c,
      player,
      label: chosen.label,
    };
  }
  return makeNeutralSample(rng);
}

const KIND_WIN = 0;
const KIND_BLOCK5 = 1;
const KIND_OPEN4 = 2;
const KIND_GOOD = 3;
const KIND_NEUTRAL = 4;
const KIND_PLAY = 5;

function makeSample(rng, kind) {
  switch (kind) {
    case KIND_WIN:
      return makeWinSample(rng);
    case KIND_BLOCK5:
      return makeBlockFiveSample(rng);
    case KIND_OPEN4:
      return makeOpenFourBlockSample(rng);
    case KIND_GOOD:
      return makeGoodSample(rng);
    case KIND_NEUTRAL:
      return makeNeutralSample(rng);
    default:
      return makeSelfPlaySample(rng);
  }
}

function makeFarNeutralSample(rng) {
  for (let t = 0; t < 30; t++) {
    const { board, player } = makeSelfPlayPosition(rng);
    const empties = T.listEmpty(board);
    const far = [];
    for (let k = 0; k < empties.length; k++) {
      const i = empties[k];
      const r = (i / T.SIZE) | 0;
      const c = i - r * T.SIZE;
      if (!T.nearStone(board, r, c, 4) && T.classifySquare(board, r, c, player) === T.NEUTRAL) {
        far.push({ r, c });
      }
    }
    if (far.length) {
      const pick = far[randInt(rng, far.length)];
      return { board, r: pick.r, c: pick.c, player, label: T.NEUTRAL };
    }
  }
  return makeNeutralSample(rng);
}

function makeNaturalEmptySample(rng) {
  for (let t = 0; t < 20; t++) {
    const { board, player } = makeSelfPlayPosition(rng);
    const empties = T.listEmpty(board);
    if (empties.length === 0) continue;
    const i = empties[randInt(rng, empties.length)];
    const r = (i / T.SIZE) | 0;
    const c = i - r * T.SIZE;
    const label = T.classifySquare(board, r, c, player);
    return { board, r, c, player, label };
  }
  return makeNeutralSample(rng);
}

function mixKind(i) {
  const r = i % 20;
  if (r < 7) return KIND_WIN;
  if (r < 11) return KIND_BLOCK5;
  if (r < 16) return KIND_OPEN4;
  if (r < 18) return KIND_GOOD;
  if (r < 19) return KIND_NEUTRAL;
  return KIND_PLAY;
}

module.exports = {
  mulberry32,
  transformRC,
  transformBoard,
  applySymmetry,
  allSymmetries,
  makeWinSample,
  makeBlockFiveSample,
  makeOpenFourBlockSample,
  makeGoodSample,
  makeNeutralSample,
  makeSelfPlayPosition,
  makeSelfPlaySample,
  makeNaturalEmptySample,
  makeFarNeutralSample,
  makeSample,
  mixKind,
  KIND_WIN,
  KIND_BLOCK5,
  KIND_OPEN4,
  KIND_GOOD,
  KIND_NEUTRAL,
  KIND_PLAY,
};
