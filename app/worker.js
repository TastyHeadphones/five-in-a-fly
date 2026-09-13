import {
  createBrain,
  loadInt8Weights,
  scoreBoard,
  pickFromScores,
  sniff,
  exportState,
  N_KC,
} from './brain.js';
import { forcedMove, SIZE } from './board.js';

let brain = null;
let meta = null;
let ready = false;

async function gunzip(buf) {
  if (typeof DecompressionStream === 'function') {
    const ds = new DecompressionStream('gzip');
    const stream = new Blob([buf]).stream().pipeThrough(ds);
    const ab = await new Response(stream).arrayBuffer();
    return new Uint8Array(ab);
  }
  throw new Error('DecompressionStream unavailable');
}

async function cachedGet(url, version) {
  const key = url + '#' + version;
  try {
    const cache = await caches.open('five-in-a-fly-' + version);
    const hit = await cache.match(key);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch ' + url + ' ' + res.status);
    const buf = new Uint8Array(await res.arrayBuffer());
    await cache.put(key, new Response(buf));
    return buf;
  } catch (err) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch ' + url + ' ' + res.status);
    return new Uint8Array(await res.arrayBuffer());
  }
}

async function load() {
  const metaRes = await fetch('../weights/meta.json');
  if (!metaRes.ok) throw new Error('meta.json ' + metaRes.status);
  meta = await metaRes.json();
  const gz = await cachedGet('../weights/kc2mbon.i8.gz', meta.version);
  const raw = await gunzip(gz);
  const i8 = new Int8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  brain = createBrain({
    seed: meta.projSeed,
    threshold: meta.threshold,
    tieMargin: meta.tieMargin,
  });
  loadInt8Weights(brain, i8, meta.scales);
  ready = true;
  postMessage({ type: 'ready', meta: { version: meta.version, nKc: N_KC } });
}

function score(board, player) {
  const t0 = performance.now();
  const cells = scoreBoard(brain, board, player);
  const forced = forcedMove(board, player);
  let move = forced;
  let reason = 'forced';
  if (move == null) {
    move = pickFromScores(board, cells, 2);
    reason = 'mb';
  }
  const chosen = cells.find((c) => c.i === move) || null;
  if (chosen) {
    sniff(brain, board, chosen.r, chosen.c, player);
  }
  const state = exportState(brain);
  return {
    type: 'scored',
    cells,
    move,
    reason,
    state,
    ms: performance.now() - t0,
  };
}

onmessage = async (ev) => {
  const msg = ev.data;
  try {
    if (msg.type === 'load') {
      await load();
      return;
    }
    if (!ready) throw new Error('brain not loaded');
    if (msg.type === 'score') {
      const board = new Uint8Array(msg.board);
      postMessage(score(board, msg.player));
      return;
    }
  } catch (err) {
    postMessage({ type: 'error', message: String(err && err.message ? err.message : err) });
  }
};
