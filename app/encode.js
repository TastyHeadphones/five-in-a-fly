import { SIZE, idx, opponent } from './board.js';

export const N_PN = 648;
export const N_KC = 5177;
export const KC_FANIN = 7;
export const N_MBON = 96;
export const N_COMP = 4;
export const MBON_PER_COMP = 24;
export const WINDOW = 9;
export const RADIUS = 4;
export const PN_MY = 3;
export const PN_OPP = 3;
export const PN_OFF = 2;
export const PN_PER_SPATIAL = PN_MY + PN_OPP + PN_OFF;
export const CLASS_WEIGHT = [1e6, 1e4, 1e2, 1];

export function pnIndex(cell, state, k) {
  const base = cell * PN_PER_SPATIAL;
  if (state === 0) return base + k;
  if (state === 1) return base + PN_MY + k;
  return base + PN_MY + PN_OPP + k;
}

export function assertDisjointPnChannels() {
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

function setPn(pn, active, nActive, p) {
  if (pn[p]) return nActive;
  pn[p] = 1;
  active[nActive] = p;
  return nActive + 1;
}

export function encode(board, row, col, player, pn, active) {
  pn.fill(0);
  let nActive = 0;
  let myCount = 0;
  let oppCount = 0;
  const opp = opponent(player);
  for (let dr = -RADIUS; dr <= RADIUS; dr++) {
    for (let dc = -RADIUS; dc <= RADIUS; dc++) {
      const r = row + dr;
      const c = col + dc;
      const cell = (dr + RADIUS) * WINDOW + (dc + RADIUS);
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) {
        nActive = setPn(pn, active, nActive, pnIndex(cell, 2, 0));
        continue;
      }
      const v = board[idx(r, c)];
      if (v === player) {
        myCount++;
        for (let k = 0; k < PN_MY; k++) nActive = setPn(pn, active, nActive, pnIndex(cell, 0, k));
      } else if (v === opp) {
        oppCount++;
        for (let k = 0; k < PN_OPP; k++) nActive = setPn(pn, active, nActive, pnIndex(cell, 1, k));
      }
    }
  }
  return { nActive, myCount, oppCount };
}
