export const SIZE = 15;
export const N = SIZE * SIZE;
export const EMPTY = 0;
export const P1 = 1;
export const P2 = 2;

export const WIN = 0;
export const BLOCK = 1;
export const GOOD = 2;
export const NEUTRAL = 3;

export const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

export function inBoard(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

export function idx(r, c) {
  return r * SIZE + c;
}

export function emptyBoard() {
  return new Uint8Array(N);
}

export function cloneBoard(board) {
  return new Uint8Array(board);
}

export function opponent(player) {
  return player ^ 3;
}

export function countRun(board, r, c, dr, dc, player) {
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

export function wouldMakeFive(board, r, c, player) {
  for (let d = 0; d < 4; d++) {
    const [dr, dc] = DIRS[d];
    if (countRun(board, r, c, dr, dc, player) >= 5) return true;
  }
  return false;
}

export function winnerAt(board, r, c, player) {
  return wouldMakeFive(board, r, c, player);
}

export function nearStone(board, r, c, rad) {
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

export function listEmpty(board) {
  const out = [];
  for (let i = 0; i < N; i++) if (board[i] === EMPTY) out.push(i);
  return out;
}

export function listCandidates(board, rad) {
  const empties = listEmpty(board);
  if (!empties.length) return empties;
  let any = false;
  for (let i = 0; i < N; i++) {
    if (board[i] !== EMPTY) {
      any = true;
      break;
    }
  }
  if (!any) return [idx(7, 7)];
  const near = [];
  for (let k = 0; k < empties.length; k++) {
    const i = empties[k];
    const r = (i / SIZE) | 0;
    const c = i - r * SIZE;
    if (nearStone(board, r, c, rad)) near.push(i);
  }
  return near.length ? near : empties;
}

export function applyMove(board, i, player) {
  board[i] = player;
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

export function wouldMakeOpenFour(board, r, c, player) {
  const i = idx(r, c);
  board[i] = player;
  const threats = countFiveThreatsThrough(board, r, c, player);
  board[i] = EMPTY;
  return threats >= 2;
}

export function forcedMove(board, player) {
  const empties = listEmpty(board);
  const opp = opponent(player);
  for (let k = 0; k < empties.length; k++) {
    const i = empties[k];
    const r = (i / SIZE) | 0;
    const c = i - r * SIZE;
    if (wouldMakeFive(board, r, c, player)) return i;
  }
  for (let k = 0; k < empties.length; k++) {
    const i = empties[k];
    const r = (i / SIZE) | 0;
    const c = i - r * SIZE;
    if (wouldMakeFive(board, r, c, opp)) return i;
  }
  for (let k = 0; k < empties.length; k++) {
    const i = empties[k];
    const r = (i / SIZE) | 0;
    const c = i - r * SIZE;
    if (wouldMakeOpenFour(board, r, c, opp)) return i;
  }
  return null;
}
