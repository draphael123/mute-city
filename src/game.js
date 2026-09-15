// MUTE CITY — race orchestration: states, input, contacts/combat, camera, HUD,
// modes (Grand Prix / Time Attack + ghost), intro, loop. Physics lives in
// player.js (momentum model) and rivals.js (rails + energy + attacks).
import * as THREE from '../vendor/three.module.js';
import { buildTrack, buildTrackMeshes } from './track.js';
import { buildWorld } from './world.js';
import { ROSTER, tuned, makeMachine, dressMachine } from './machines.js';
import { ensureAudio, setEngine, setEngineBase, setSfxVolume, setAnnouncer, say, sfx } from './audio.js';
import { music } from './music.js';
import { settings, openSettings, openPause, closeAll, isOpen as menuOpen, pollGamepad } from './menus.js';
import { makePlayer, resetPlayer, stepPlayer } from './player.js';
import { DIFF, makeRival, resetRival, stepRival, rivalContacts, damageRival } from './rivals.js';
import { makeFX, makeSpeedLines } from './fx.js';
import { prefs, openModes, closeModes, modesOpen, openSelect, closeSelect, selectOpen, pollPad, loadGhost, saveGhost } from './select.js';
const S = settings.data;

const Q = new URLSearchParams(location.search);
const BOT = Q.get('bot') === '1';
const LAPS = 3, SPEED_DISPLAY = 2.4, DT = 1 / 120, GHOST_HZ = 30;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const sign = x => x < 0 ? -1 : 1;
let seed = 11; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

// ---------- renderer / scene ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
function applyQuality() { renderer.setPixelRatio(S.quality === 'low' ? 0.75 : S.quality === 'medium' ? 1 : Math.min(devicePixelRatio, 1.5)); }
applyQuality();
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.5, 9000);
function resize() { const w = innerWidth || 1280, h = innerHeight || 720; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
settings.onChange((k, v) => { if (k === 'quality') { applyQuality(); resize(); } if (k === 'music') music.setVolume(v / 100); if (k === 'sfx') setSfxVolume(v / 100); if (k === 'announcer') setAnnouncer(v); });
setAnnouncer(S.announcer !== false);
music.setVolume(S.music / 100); setSfxVolume(S.sfx / 100);

const tr = buildTrack();
scene.add(buildTrackMeshes(tr));
const world = buildWorld(scene, tr);
const fx = makeFX(scene, tr);
const drawSpeedLines = makeSpeedLines(document.getElementById('lines'));
const dsWrap = d => { const L = tr.length; d = ((d % L) + L) % L; return d > L / 2 ? d - L : d; };

// ---------- machines ----------
const player = makePlayer(tuned(ROSTER[prefs.machine] || ROSTER[0], prefs.balance || 0));
player.mesh = makeMachine(player.m); scene.add(player.mesh);
let rivals = [];
function setPlayerMachine(idx, bal) {
  scene.remove(player.mesh); player.m = tuned(ROSTER[idx], bal); player.mesh = makeMachine(player.m); scene.add(player.mesh);
  setEngineBase(52 - (player.m.weight - 1300) / 70);
  for (const rv of rivals) scene.remove(rv.mesh);
  rivals = ROSTER.filter(m => m.i !== idx).map(m => { const rv = makeRival(m, makeMachine(m)); scene.add(rv.mesh); return rv; });
}
setPlayerMachine(player.m.i, player.m.balance);
const F = tr.mkFrame(), F2 = tr.mkFrame();
const _fwd = new THREE.Vector3(), _rt = new THREE.Vector3(), _up = new THREE.Vector3(), _rt2 = new THREE.Vector3(), _pos = new THREE.Vector3(), _f2 = new THREE.Vector3(), _up2 = new THREE.Vector3();
function placeMachine(m, s, u, n, h, roll, bob, pitch = 0) {
  tr.frame(s, F);
  _pos.copy(F.p).addScaledVector(F.r, u).addScaledVector(F.n, n + 1.1 + bob);
  _fwd.copy(F.t).multiplyScalar(Math.cos(h)).addScaledVector(F.r, -Math.sin(h));
  _rt.copy(F.r).multiplyScalar(Math.cos(h)).addScaledVector(F.t, Math.sin(h));
  if (pitch) { _f2.copy(_fwd).multiplyScalar(Math.cos(pitch)).addScaledVector(F.n, Math.sin(pitch)); _fwd.copy(_f2); }
  _up.crossVectors(_rt, _fwd).normalize();
  const cr = Math.cos(roll), sr = Math.sin(roll); _up2.copy(_up).multiplyScalar(cr).addScaledVector(_rt, sr); _rt2.copy(_rt).multiplyScalar(cr).addScaledVector(_up, -sr); _up.copy(_up2);
  m.matrix.makeBasis(_rt2, _up, _fwd).setPosition(_pos); m.matrixWorldNeedsUpdate = true;
}
// ghost
const ghost = { data: loadGhost(), mesh: null, rec: [], recT: 0, delta: 0 };
function buildGhostMesh() { if (ghost.mesh) scene.remove(ghost.mesh); ghost.mesh = null; if (!ghost.data) return; const m = ROSTER.find(r => r.name === ghost.data.machine) || ROSTER[0]; ghost.mesh = makeMachine(m, { ghost: true }); ghost.mesh.visible = false; scene.add(ghost.mesh); }
buildGhostMesh();

// ---------- race state ----------
const race = { state: 'title', mode: 'gp', diff: DIFF.standard, countdown: 0, time: 0, rank: 30, finalRank: 0, msg: '', msgT: 0, shake: 0, fade: 0, nameIdx: 0, trackT: 0, kos: 0, alarmT: 0, whooshT: 0, newRecord: false, prev: 'race', attackT: 0 };
function placeGrid() {
  const ta = race.mode === 'ta';
  const grid = ta ? [player] : [player, ...rivals];
  grid.forEach((m, i) => { // rows of 3, player in row 4 (P14 of 30) in GP
    const slot = ta ? 0 : (i === 0 ? 13 : (i <= 13 ? i - 1 : i)); const row = Math.floor(slot / 3), lane = [-13, 0, 13][slot % 3];
    m.s = tr.wrap(-16 - row * 11); m.u = lane; m.prog = m.s - tr.length;
    if (m === player) resetPlayer(m); else resetRival(m, lane);
  });
  if (ta) for (const rv of rivals) { rv.dead = true; rv.mesh.visible = false; rv.prog = -1e9; }
  for (const pd of tr.pads) pd.cool = 0; for (const jp of tr.jumps) jp.cool = 0; for (const mn of tr.mines) mn.cool = 0;
}
function resetRace() {
  placeGrid(); closeAll(); closeModes(); closeSelect(); camInit = false; race.state = 'countdown'; race.countdown = 3.999; race._cd = 4; race.time = 0; race.msg = ''; race.msgT = 0; race.fade = 0; race.nameIdx = 0; race.kos = 0; race.newRecord = false;
  ghost.rec = []; ghost.recT = 0; ghost.delta = 0; if (ghost.mesh) ghost.mesh.visible = race.mode === 'ta' && !!ghost.data;
  ui.end.hidden = true; ui.title.hidden = true; ui.intro.hidden = true; ui.black.style.opacity = 0; music.setDuck(1); music.play('race'); race.trackT = 6;
}
function pause() { if (race.state !== 'race' && race.state !== 'countdown') return; race.prev = race.state; race.state = 'paused'; music.setDuck(0.35); openPause({ resume: () => { race.state = race.prev; music.setDuck(1); }, restart: () => resetRace(), quit: () => quitToTitle() }); }
function quitToTitle() { closeAll(); closeModes(); closeSelect(); race.state = 'title'; ui.title.hidden = false; ui.end.hidden = true; ui.intro.hidden = true; ui.black.style.opacity = 0; music.setDuck(1); music.play('menu'); }
// title → modes → machine select → (intro) → race
function startFlow() {
  ui.title.hidden = true; ui.end.hidden = true; race.state = 'menus'; placeGrid(); music.setDuck(1); music.play('menu');
  openModes(id => {
    if (id === 'back') { quitToTitle(); return; }
    if (id === 'settings') { openSettings(() => startFlow()); return; }
    race.mode = id; race.diff = DIFF[prefs.diff] || DIFF.standard; race.state = 'select'; placeGrid(); player.s = 34; player.u = 0;
    openSelect((ev, idx, bal) => {
      if (ev === 'preview') { setPlayerMachine(idx, prefs.balance); placeGrid(); player.s = 34; player.u = 0; return; }
      if (ev === 'back') { startFlow(); return; }
      setPlayerMachine(idx, bal); if (race.mode === 'gp' && S.intro) startIntro(); else resetRace();
    });
  });
}
function onStart() { if (race.state === 'title') startFlow(); else if (race.state === 'intro') resetRace(); else if (race.state === 'race' || race.state === 'countdown') pause(); else if (race.state === 'finished' || race.state === 'retired') startFlow(); }
// ---------- intro flyover ----------
const INTRO = [
  { dur: 3.8, a: [-200, -85, 55], b: [30, -30, 12], look: [-45, 0, 1], cap: 'MUTE CITY' },
  { dur: 3.8, a: [tr.sOf(7, 0.55), 80, 40], b: [tr.sOf(9, 0.6), 80, 40], look: 'ahead', cap: 'TWIST ROAD' },
  { dur: 3.4, a: [tr.sOf(11, 0.8), -140, 120], b: [tr.sOf(14, 0.3), -140, 120], look: 'road', cap: 'HALFPIPE' },
  { dur: 3.2, a: [tr.gap[0] - 280, 50, 26], b: [tr.gap[1] + 150, 50, 26], look: [(tr.gap[0] + tr.gap[1]) / 2, 0, -12], cap: 'THE DIVE' },
  { dur: 3.0, a: ['grid+', 0, 32], b: ['grid', 0, 7], look: 'player', cap: '3 LAPS · 30 MACHINES' },
];
const intro = { i: 0, t: 0 };
const _cp = new THREE.Vector3(), _cl = new THREE.Vector3();
const resolveS = v => v === 'grid' ? player.s + 18 : v === 'grid+' ? player.s + 160 : v;
function startIntro() { placeGrid(); race.state = 'intro'; intro.i = 0; intro.t = 0; ui.title.hidden = true; ui.end.hidden = true; ui.intro.hidden = false; music.play('menu'); }
function updateIntro(dt) {
  const sh = INTRO[intro.i]; intro.t += dt;
  const f = Math.min(1, intro.t / sh.dur), e = f * f * (3 - 2 * f);
  const sA = resolveS(sh.a[0]), sB = resolveS(sh.b[0]);
  const s = sA + (sB - sA) * e, u = sh.a[1] + (sh.b[1] - sh.a[1]) * e, n = sh.a[2] + (sh.b[2] - sh.a[2]) * e;
  tr.toWorld(s, u, n, _cp);
  if (sh.look === 'ahead') tr.toWorld(s + 60, 0, 0, _cl); else if (sh.look === 'road') tr.toWorld(s + 30, 0, 0, _cl); else if (sh.look === 'player') tr.toWorld(player.s, player.u, 1, _cl); else tr.toWorld(sh.look[0], sh.look[1], sh.look[2], _cl);
  camera.position.copy(_cp); camera.up.set(0, 1, 0); camera.lookAt(_cl); camera.fov = 58; camera.updateProjectionMatrix();
  ui.introCap.textContent = sh.cap; ui.introCap.style.opacity = f < 0.15 ? f / 0.15 : f > 0.85 ? (1 - f) / 0.15 : 1;
  ui.black.style.opacity = f < 0.1 ? 1 - f / 0.1 : f > 0.92 ? (f - 0.92) / 0.08 : 0;
  if (f >= 1) { intro.i++; intro.t = 0; if (intro.i >= INTRO.length) resetRace(); }
}
// machine-select camera: orbit the player's machine on the grid
let selT = 0;
function updateSelectCamera(dt) {
  selT += dt; tr.frame(player.s, F);
  _pos.copy(F.p).addScaledVector(F.r, player.u).addScaledVector(F.n, 1.2);
  const a = selT * 0.5; _cp.copy(_pos).addScaledVector(F.t, Math.cos(a) * 16).addScaledVector(F.r, Math.sin(a) * 16).addScaledVector(F.n, 5.5);
  camera.position.copy(_cp); camera.up.copy(F.n); camera.lookAt(_pos); camera.fov += (50 - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
}

// ---------- input ----------
const keys = {}; const tap = { side: 0, spin: false, lastQ: -9, lastE: -9 };
addEventListener('keydown', e => { if (menuOpen() || modesOpen() || selectOpen()) return;
  const first = !keys[e.code]; keys[e.code] = true; if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault(); ensureAudio(); music.unlock();
  if (race.state === 'title') { if (e.code === 'Enter' || e.code === 'Space') startFlow(); else if (e.code === 'KeyS') openSettings(); else music.play('menu'); return; }
  if (race.state === 'intro') { resetRace(); return; }
  if ((race.state === 'race' || race.state === 'countdown') && (e.code === 'Escape' || e.code === 'KeyP')) { pause(); return; }
  if (race.state === 'finished' || race.state === 'retired') { if (e.code === 'KeyR' || e.code === 'Enter') resetRace(); else if (e.code === 'Escape') startFlow(); return; }
  if (first && race.state === 'race') { const t = performance.now() / 1000;
    if (e.code === 'KeyQ') { if (t - tap.lastQ < 0.28) tap.side = -1; tap.lastQ = t; }
    if (e.code === 'KeyE') { if (t - tap.lastE < 0.28) tap.side = 1; tap.lastE = t; }
    if (e.code === 'KeyZ' || e.code === 'KeyC') tap.spin = true; }
  if (e.code === 'KeyR' && race.state === 'race' && e.shiftKey) resetRace(); });
addEventListener('keyup', e => { keys[e.code] = false; });
const padPrev = { lb: false, rb: false, y: false, lastLB: -9, lastRB: -9 };
function readInput() {
  const gp = navigator.getGamepads ? navigator.getGamepads()[0] : null;
  let steer = (keys.ArrowLeft || keys.KeyA ? 1 : 0) - (keys.ArrowRight || keys.KeyD ? 1 : 0);
  let thr = keys.ArrowUp || keys.KeyW ? 1 : 0, brake = keys.ArrowDown || keys.KeyS ? 1 : 0;
  let slideL = !!keys.KeyQ, slideR = !!keys.KeyE, drift = !!(keys.ShiftLeft || keys.ShiftRight) || (slideL && slideR), boost = !!(keys.Space || keys.KeyX);
  if (gp) { const ax = gp.axes[0] || 0; if (Math.abs(ax) > 0.12) steer = -ax; if (gp.buttons[0]?.pressed || (gp.buttons[7]?.value || 0) > 0.2) thr = 1; if (gp.buttons[1]?.pressed || (gp.buttons[6]?.value || 0) > 0.2) brake = 1;
    const lb = !!gp.buttons[4]?.pressed, rb = !!gp.buttons[5]?.pressed; if (lb) slideL = true; if (rb) slideR = true; if (lb && rb) drift = true; if (gp.buttons[2]?.pressed) boost = true;
    const t = performance.now() / 1000; if (lb && !padPrev.lb) { if (t - padPrev.lastLB < 0.28) tap.side = -1; padPrev.lastLB = t; } if (rb && !padPrev.rb) { if (t - padPrev.lastRB < 0.28) tap.side = 1; padPrev.lastRB = t; }
    const y = !!gp.buttons[3]?.pressed; if (y && !padPrev.y) tap.spin = true; padPrev.lb = lb; padPrev.rb = rb; padPrev.y = y; }
  if (drift) { slideL = slideR = false; }
  const out = { steer, thr, brake, drift, slideL, slideR, boost, spin: tap.spin, sideTap: tap.side };
  tap.spin = false; tap.side = 0; return out;
}

// ---------- bot (autopilot for verification) ----------
function botInput(P) {
  const M = P.m, look = 22 + P.v * 0.28, kNow = tr.curv(P.s), kA = tr.curv(P.s + look), kA2 = tr.curv(P.s + look * 2);
  const hwm = tr.halfW(P.s + look) - 4.5;
  let uT = 0; if (Math.abs(kA) > 0.002) uT = -sign(kA) * hwm * (Math.abs(kA) > 0.007 ? 0.25 : 0.45) * Math.min(1, Math.abs(kA) * 200);
  if (tr.roughAhead(P.s, uT)) uT = tr.roughEscape(P.s, uT);
  for (const mn of tr.mines) { const d = dsWrap(mn.s - P.s); if (d > 0 && d < 90 && Math.abs(uT - mn.lane) < 6) uT = mn.lane + (uT >= mn.lane ? 7 : -7); }
  const nearGap = Math.abs(dsWrap(tr.gap[0] - P.s)) < 160; if (nearGap) uT = 0;
  const hDes = clamp(Math.asin(clamp((P.u - uT) / look, -0.5, 0.5)), -0.32, 0.32) + clamp(P.vu / (P.v + 1), -0.3, 0.3) * 0.8;
  const aNeed = P.v * P.v * Math.abs(kA);
  const drift = !P.air && !nearGap && aNeed > 0.7 * M.aMax;
  const yawRate = 0.95 * M.yawMul * (drift ? 1.85 : 1);
  const steer = clamp((hDes - P.h) * 5 + P.v * kNow / yawRate, -1, 1);
  // stopping-distance lookahead: can we still slow to the corner speed by the time we get there?
  let vLim = 999; for (let d = 0; d <= P.v * 1.8 + 40; d += 15) { const kk = Math.abs(tr.curv(P.s + 8 + d)); if (kk < 1e-4) continue; const dr = P.v * P.v * kk > 0.7 * M.aMax; const vc = Math.sqrt(M.aMax * (dr ? 1.35 : 1) * 0.9 / kk); vLim = Math.min(vLim, Math.sqrt(vc * vc + 2 * 50 * d)); }
  const thr = P.v < vLim * 0.98 ? 1 : 0, brake = P.v > vLim * 1.04 ? 1 : 0;
  const boost = P.lap >= 2 && P.energy > 45 && Math.abs(kA) < 0.0015 && Math.abs(kA2) < 0.0025 && !P.air;
  let spin = false, sideTap = 0;
  for (const rv of rivals) { if (rv.dead) continue; const ds = dsWrap(rv.s - P.s), du = rv.u - P.u; if (Math.abs(ds) < 6 && Math.abs(du) < 7 && P.spinCool <= 0) spin = true; else if (Math.abs(ds) < 6 && Math.abs(du) >= 4 && Math.abs(du) < 9 && P.sideCool <= 0) sideTap = sign(du); }
  return { steer, thr, brake, drift, slideL: false, slideR: false, boost, spin, sideTap };
}

// ---------- combat / contact ----------
function toast(t, dur = 1.2) { race.msg = t; race.msgT = dur; }
function retire(reason) { if (race.state !== 'race') return; race.state = 'retired'; sfx.explode(); race.shake = 2.5; say('Machine destroyed.', 1.0, 0.7); fx.explode(player.s, player.u, player.n); ui.endTitle.textContent = 'MACHINE DESTROYED'; ui.endBody.innerHTML = `${reason}.<br><span class="dim">Wall hits: ${player.hits} · Falls: ${player.falls} · K.O.s: ${race.kos}</span>`; ui.end.hidden = false; music.setDuck(0.5); }
function fall(P, inGap) {
  P.stun = 1.6; P.energy -= 12 * P.m.bodyMul; P.vs = 35; P.vu = 0; P.u = 0; P.h = 0; P.air = false; P.n = 0; P.vn = 0; P.falls++;
  if (inGap) P.s = tr.wrap(tr.gap[1] + 12);
  race.fade = 1; sfx.fall(); toast('FELL OFF THE COURSE', 1.4);
  if (P.energy <= 0) { P.energy = 0; retire('FELL OFF THE COURSE'); }
}
function damagePlayer(amount, pushDir, rv) {
  const P = player; if (P.stun > 0 || P.air || race.time < 4 || race.attackT > 0) return; race.attackT = 3 / race.diff.agg;
  P.energy -= amount * P.m.bodyMul; P.vu += pushDir * 10; P.h += pushDir * 0.04; P.flash = 1; P.hitT = 0.3; sfx.side(); sfx.hit(0.6); race.shake = Math.max(race.shake, 0.5);
  fx.spark(P.s, P.u, -pushDir, 1.2); if (rv) toast(`${rv.name} ATTACKS`, 0.8);
  if (P.energy <= 0) { P.energy = 0; retire(`TAKEN OUT BY ${rv ? rv.name : 'A RIVAL'}`); }
}
const fxHooks = {
  explode(rv) { fx.explode(rv.s, rv.u); sfx.ko(); race.shake = Math.max(race.shake, 0.6); },
  spark(rv, side) { fx.spark(rv.s, rv.u, side, 0.6); },
  rivalFall(rv) {},
  koToast(rv) { toast(`${rv.name} IS OUT`, 1.0); },
};
const rivalCtx = { tr, dsWrap, get diff() { return race.diff; }, player, get raceTime() { return race.time; }, get lap2() { return player.lap >= 2; }, fx: fxHooks, damagePlayer };
function ko(rv) { race.kos++; player.kos++; toast(`K.O.! ${rv.name}`, 1.4); say('K O!', 1.2, 0.8); }
function contacts(dt) {
  const P = player; if (race.mode === 'ta') return;
  for (const rv of rivals) {
    if (rv.dead || P.air || P.stun > 0 || race.state !== 'race') continue;
    const ds = dsWrap(rv.s - P.s), du = rv.u - P.u, wr = Math.sqrt(P.m.weight / rv.m.weight);
    // whoosh on a pass
    if (rv.prevDs !== undefined && sign(rv.prevDs) !== sign(ds) && Math.abs(ds) < 30 && Math.abs(du) < 9 && Math.abs(rv.v - P.v) > 12 && race.whooshT <= 0) { sfx.whoosh(); race.whooshT = 0.4; }
    rv.prevDs = ds;
    if (rv.touchT > 0) continue;
    // side attack lunge
    if (P.sideT > 0 && Math.abs(ds) < 9 && du * P.sideDir > 0 && Math.abs(du) < 8.5) {
      rv.touchT = 0.6; rv.u += P.sideDir * 7; rv.spinT = 0.8; rv.spinDir = P.sideDir; rv.v *= 0.8; P.vu -= P.sideDir * 8; P.energy -= 2 * P.m.bodyMul;
      fx.spark(rv.s, rv.u, P.sideDir, 1.5); sfx.hit(0.9); race.shake = Math.max(race.shake, 0.45);
      if (damageRival(rv, 26 * wr, rivalCtx)) ko(rv); continue;
    }
    // spin attack
    if (P.spinT > 0 && Math.abs(ds) < 8 && Math.abs(du) < 7.5) {
      rv.touchT = 0.5; const dir = sign(du || 1); rv.u += dir * 5; rv.spinT = 0.6; rv.spinDir = dir; rv.v *= 0.85;
      fx.spark(rv.s, rv.u, dir, 1.2); sfx.hit(0.8); race.shake = Math.max(race.shake, 0.35);
      if (damageRival(rv, 20 * wr, rivalCtx)) ko(rv); continue;
    }
    // plain contact: heavier machine shoves harder
    if (Math.abs(ds) < 9 && Math.abs(du) < 5.5) {
      rv.touchT = 0.4; const push = sign(du || (rnd() - 0.5));
      P.u -= push * 2.4 / wr; P.vu -= push * 6 / wr; rv.u += push * 2.4 * wr; P.h += push * 0.04; if (race.time > 3) P.energy -= 0.5 * P.m.bodyMul; P.vs *= 0.98; rv.v *= 0.98; P.flash = 0.5;
      if (P.hitT <= 0) { sfx.hit(0.3); P.hitT = 0.3; } race.shake = Math.max(race.shake, 0.2); fx.spark(P.s, P.u, push, 0.4);
      if (damageRival(rv, 3 * wr, rivalCtx)) ko(rv);
      if (P.energy <= 0) { P.energy = 0; retire('WORN DOWN IN THE PACK'); }
    }
  }
}
const playerEnv = { tr, dsWrap, get sens() { return S.steer / 100; }, canBoost: () => player.lap >= 2 && race.state === 'race', retire, fall,
  fx: { hit(impact, side) { if (player.hitT <= 0) sfx.hit(impact / 30); player.hitT = 0.25; race.shake = Math.max(race.shake, 0.3 + impact * 0.02); fx.spark(player.s, player.u, side, Math.min(2, impact / 15)); },
    jump() { toast('JUMP', 0.6); }, land() { race.shake = Math.max(race.shake, 0.35); }, pad() { sfx.pad(); race.shake = Math.max(race.shake, 0.25); },
    boostStart() { sfx.boost(); race.shake = Math.max(race.shake, 0.4); }, spin() { sfx.spin(); }, side() { sfx.side(); }, spinOut() { race.shake = Math.max(race.shake, 0.8); toast('SPIN OUT', 0.8); },
    mine(mn) { sfx.mine(); race.shake = Math.max(race.shake, 1.0); fx.explode(mn.s, mn.lane); toast('MINE!', 0.9); } } };

function step(dt) {
  const P = player;
  if (race.state === 'countdown') { race.countdown -= dt; const n = Math.ceil(race.countdown); if (n !== race._cd) { race._cd = n; if (n > 0) { sfx.beep(false); if (n <= 3) say(String(n), 1.0, 0.8); } else { sfx.beep(true); say('Go!', 1.1, 0.9); race.state = 'race'; P.lapStart = 0; toast('GO!', 0.8); } } P.thrust = (BOT ? 1 : readInput().thr); return; }
  if (race.state !== 'race' && race.state !== 'finished') return;
  race.time += dt; if (race.whooshT > 0) race.whooshT -= dt; if (race.attackT > 0) race.attackT -= dt;
  const inp = race.state === 'race' ? (BOT ? botInput(P) : readInput()) : { steer: 0, thr: 0, brake: 0.3, drift: false, slideL: false, slideR: false, boost: false, spin: false, sideTap: 0 };
  const prevS = P.s;
  stepPlayer(P, inp, dt, playerEnv);
  if (race.state === 'race' && P.half && P.s < prevS - tr.length / 2) {
    P.half = false; const lt = race.time - P.lapStart; P.laps.push(lt); P.lapStart = race.time; P.lap++; sfx.lap();
    if (P.lap > LAPS) finish(); else { toast(P.lap === 2 ? 'LAP 2 — BOOST UNLOCKED' : 'FINAL LAP', 1.5); say(P.lap === 2 ? 'Boost power!' : 'Final lap!'); }
  }
  if (race.mode === 'gp') { for (const rv of rivals) stepRival(rv, dt, rivalCtx); rivalContacts(rivals, dt, rivalCtx); contacts(dt); }
  if (race.state === 'race') { let r = 1; for (const rv of rivals) if (!rv.dead && rv.prog > P.prog) r++; race.rank = r; }
  // ghost: record and compare
  if (race.mode === 'ta' && race.state === 'race') {
    ghost.recT += dt; if (ghost.recT >= 1 / GHOST_HZ) { ghost.recT -= 1 / GHOST_HZ; ghost.rec.push(+P.s.toFixed(1), +P.u.toFixed(2), +P.n.toFixed(2), +P.h.toFixed(3), P.lap); }
    if (ghost.data) { const i = Math.min(ghost.data.frames.length / 5 - 1, Math.floor(race.time * GHOST_HZ)) * 5; const gs = ghost.data.frames[i], gl = ghost.data.frames[i + 4]; const gp = (gl - 1) * tr.length + gs; ghost.delta = (gp - P.prog) / Math.max(60, P.v); }
  }
  const nm = tr.names[race.nameIdx % tr.names.length]; if (Math.abs(dsWrap(P.s - nm.s)) < 6 && P.v > 5) { toast(nm.name, 1.0); race.nameIdx++; }
  if (P.energy < 20 && race.state === 'race') { race.alarmT -= dt; if (race.alarmT <= 0) { sfx.alarm(); race.alarmT = 0.9; } }
}
const fmt = t => `${Math.floor(t / 60)}'${(t % 60).toFixed(2).padStart(5, '0')}`;
function finish() {
  race.state = 'finished'; race.finalRank = race.rank; player.lap = LAPS; music.setDuck(0.7); say(race.mode === 'ta' && race.time < (ghost.data ? ghost.data.total : Infinity) ? 'New record!' : 'Finish!');
  const best = Math.min(...player.laps);
  if (race.mode === 'ta') {
    const prevBest = ghost.data ? ghost.data.total : Infinity; race.newRecord = race.time < prevBest;
    if (race.newRecord) { ghost.data = { total: race.time, laps: player.laps.slice(), machine: player.m.name, frames: ghost.rec.slice(), hz: GHOST_HZ }; saveGhost(ghost.data); buildGhostMesh(); }
    ui.endTitle.textContent = race.newRecord ? 'NEW RECORD!' : 'TIME ATTACK';
    ui.endBody.innerHTML = `Total <b>${fmt(race.time)}</b>${prevBest < Infinity ? ` <span class="dim">(record ${fmt(Math.min(prevBest, race.time))})</span>` : ''}<br>${player.laps.map((t, i) => `Lap ${i + 1} <b>${fmt(t)}</b>`).join(' · ')}<br><span class="dim">Best lap ${fmt(best)} · ${player.m.name}</span>`;
  } else {
    ui.endTitle.textContent = `FINISH — ${ordinal(race.rank)} PLACE`;
    ui.endBody.innerHTML = `Total <b>${fmt(race.time)}</b> · ${race.diff.name}<br>${player.laps.map((t, i) => `Lap ${i + 1} <b>${fmt(t)}</b>`).join(' · ')}<br><span class="dim">K.O.s ${race.kos} · Wall hits ${player.hits} · Falls ${player.falls} · Best lap ${fmt(best)}</span>`;
  }
  ui.end.hidden = false;
}
const ordinal = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');

// ---------- camera ----------
const camPos = new THREE.Vector3(), camUp = new THREE.Vector3(0, 1, 0), camLook = new THREE.Vector3(), _d = new THREE.Vector3();
let camInit = false;
function updateCamera(dt) {
  const P = player; tr.frame(P.s, F);
  const h = P.h * 0.4 + clamp(P.vu / (P.v + 20), -0.3, 0.3) * 0.5;
  _fwd.copy(F.t).multiplyScalar(Math.cos(h)).addScaledVector(F.r, -Math.sin(h));
  _pos.copy(F.p).addScaledVector(F.r, P.u).addScaledVector(F.n, P.n + 1.1);
  const far = S.camera === 'far'; _d.copy(_pos).addScaledVector(_fwd, -((far ? 20 : 13) + P.v * 0.03 + P.boostP * 2)).addScaledVector(F.n, (far ? 7.5 : 4.6) + Math.max(0, P.n * 0.2));
  if (!camInit) { camPos.copy(_d); camUp.copy(F.n); camInit = true; }
  const a = 1 - Math.exp(-dt * 9), b = 1 - Math.exp(-dt * 7);
  camPos.lerp(_d, a); camUp.lerp(F.n, b).normalize();
  camLook.copy(_pos).addScaledVector(_fwd, 40).addScaledVector(F.n, 0.5);
  if (race.shake > 0) { race.shake = Math.max(0, race.shake - dt * 2.2); if (S.shake) camPos.addScaledVector(F.r, (Math.random() - 0.5) * race.shake * 1.2).addScaledVector(F.n, (Math.random() - 0.5) * race.shake * 0.8); }
  camera.position.copy(camPos); camera.up.copy(camUp); camera.lookAt(camLook);
  const fov = 62 + P.v * 0.09 + P.boostP * 14 + (P.padT > 0 ? 5 : 0);
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 6); camera.updateProjectionMatrix();
}

// ---------- HUD ----------
const $ = id => document.getElementById(id);
const ui = { speed: $('speed'), energy: $('energyFill'), energyWrap: $('energy'), lap: $('lap'), rank: $('rank'), boost: $('boost'), msg: $('msg'), times: $('times'), title: $('title'), end: $('end'), endTitle: $('endTitle'), endBody: $('endBody'), fade: $('fade'), mini: $('mini'), name: $('nameTag'), unit: $('unit'), track: $('track'), intro: $('intro'), introCap: $('introCap'), black: $('black'), kos: $('kos'), ghostDelta: $('ghostDelta'), hud: $('hud') };
const mini = ui.mini.getContext('2d'); const miniBase = document.createElement('canvas'); miniBase.width = miniBase.height = 170;
{ let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9; for (const p of tr.pos) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const sc = 150 / Math.max(maxX - minX, maxZ - minZ); mini.mx = x => 10 + (x - minX) * sc + (150 - (maxX - minX) * sc) / 2; mini.mz = z => 10 + (z - minZ) * sc + (150 - (maxZ - minZ) * sc) / 2;
  const c = miniBase.getContext('2d'); c.strokeStyle = 'rgba(120,230,255,0.9)'; c.lineWidth = 3; c.lineJoin = 'round'; c.beginPath(); tr.pos.forEach((p, i) => i ? c.lineTo(mini.mx(p.x), mini.mz(p.z)) : c.moveTo(mini.mx(p.x), mini.mz(p.z))); c.closePath(); c.stroke();
  c.fillStyle = '#fff'; c.fillRect(mini.mx(tr.pos[0].x) - 2, mini.mz(tr.pos[0].z) - 2, 5, 5); }
let hudFrame = 0;
function updateHUD(dt) {
  const P = player, inRace = ['race', 'countdown', 'finished', 'retired', 'paused'].includes(race.state);
  ui.hud.style.opacity = inRace ? 1 : 0;
  const kmh = P.v * 3.6 * SPEED_DISPLAY; ui.speed.textContent = Math.round(S.unit === 'mph' ? kmh * 0.621371 : kmh); ui.unit.textContent = S.unit; ui.mini.hidden = !S.minimap;
  if (race.trackT > 0 && music.now) { race.trackT -= dt; ui.track.textContent = `♪ ${music.now.title.toUpperCase()} · ${music.now.by}`; ui.track.style.opacity = Math.min(1, race.trackT); } else ui.track.style.opacity = 0;
  const e = Math.max(0, P.energy); ui.energy.style.width = e + '%'; ui.energy.style.background = e > 45 ? 'linear-gradient(90deg,#3cf0a0,#9bffdf)' : e > 20 ? 'linear-gradient(90deg,#ffc22e,#ffe58a)' : 'linear-gradient(90deg,#ff2a5a,#ff8aa0)';
  ui.energyWrap.classList.toggle('hit', P.hitT > 0); ui.energyWrap.classList.toggle('charge', tr.onRecharge(P.s) && !P.air && race.state === 'race'); ui.energyWrap.classList.toggle('low', e < 20 && race.state === 'race');
  ui.lap.textContent = `LAP ${Math.min(P.lap, LAPS)}/${LAPS}`;
  ui.rank.innerHTML = race.mode === 'ta' ? '' : `<b>${race.rank}</b><small>/${rivals.length + 1}</small>`;
  ui.kos.textContent = race.mode === 'gp' && race.kos ? `K.O. ×${race.kos}` : '';
  ui.ghostDelta.textContent = race.mode === 'ta' && ghost.data && race.state === 'race' ? `${ghost.delta > 0 ? '+' : '−'}${Math.abs(ghost.delta).toFixed(2)}s vs record` : ''; ui.ghostDelta.style.color = ghost.delta > 0 ? '#ff8aa0' : '#9bffdf';
  ui.boost.textContent = P.lap >= 2 ? (P.boosting ? 'BOOSTING' : 'BOOST — HOLD') : 'BOOST LOCKED · LAP 1';
  ui.boost.className = P.lap >= 2 ? (P.boosting ? 'on' : 'ready') : '';
  if (race.state === 'countdown') { const n = Math.ceil(race.countdown); ui.msg.textContent = n > 0 ? Math.min(3, n) : 'GO!'; ui.msg.classList.add('big'); }
  else if (race.msgT > 0) { race.msgT -= dt; ui.msg.textContent = race.msg; ui.msg.classList.toggle('big', race.msg === 'GO!'); }
  else ui.msg.textContent = '';
  ui.times.innerHTML = `<div>TIME <b>${fmt(race.time)}</b></div>` + P.laps.map((t, i) => `<div>L${i + 1} ${fmt(t)}</div>`).join('');
  race.fade = Math.max(0, race.fade - dt * 1.2); ui.fade.style.opacity = race.fade;
  if (hudFrame++ % 2 === 0) { mini.clearRect(0, 0, 170, 170); mini.drawImage(miniBase, 0, 0);
    for (const rv of rivals) { if (rv.dead) continue; tr.frame(rv.s, F2); mini.fillStyle = '#ff6ad0'; mini.fillRect(mini.mx(F2.p.x) - 1.5, mini.mz(F2.p.z) - 1.5, 3, 3); }
    tr.frame(P.s, F2); mini.fillStyle = '#5cf2ff'; mini.beginPath(); mini.arc(mini.mx(F2.p.x), mini.mz(F2.p.z), 4, 0, 7); mini.fill(); mini.strokeStyle = '#fff'; mini.lineWidth = 1.5; mini.stroke(); }
  let best = null, bd = 1e9; for (const rv of rivals) { if (rv.dead) continue; const d = dsWrap(rv.s - P.s); if (d > 0 && d < bd) { bd = d; best = rv; } }
  ui.name.textContent = best && bd < 400 && race.mode === 'gp' ? `▲ ${best.name} · ${Math.round(bd)} m` : '';
}

// ---------- render ----------
let bobT = 0;
function render(dt) {
  bobT += dt; const P = player;
  const spinVis = P.spinT > 0 ? (0.9 - P.spinT) / 0.9 * Math.PI * 4 : 0;
  placeMachine(P.mesh, P.s, P.u, P.n, P.h + spinVis, -(P.steer * 0.35 + P.h * 0.3 + clamp(P.slip * 0.015, -0.35, 0.35)), Math.sin(bobT * 7) * 0.08 * (P.v < 5 ? 1 : 0.4), clamp(-P.accVis * 0.0025, -0.12, 0.12) + (P.air ? clamp(P.vn * 0.02, -0.3, 0.3) : 0));
  dressMachine(P.mesh, P.thrust * 0.6 + P.v / P.m.TOP * 0.6, P.boostP > 0.05 ? P.boostP : (P.padT > 0 ? 0.35 : 0), Math.max(0, P.flash), P.energy < 20 && race.state === 'race' ? 0.5 + 0.5 * Math.sin(bobT * 10) : 0);
  P.mesh.visible = race.state !== 'retired' && (P.stun <= 0 || Math.floor(bobT * 20) % 2 === 0);
  for (const rv of rivals) { if (!rv.mesh.visible) continue; const k = tr.curv(rv.s); placeMachine(rv.mesh, rv.s, rv.u, 0, rv.h + clamp((rv.uT - rv.u) * 0.01, -0.15, 0.15), -(k * rv.v * 0.15 + (rv.uT - rv.u) * 0.02), Math.sin(bobT * 6 + rv.s) * 0.06); dressMachine(rv.mesh, 0.5 + rv.v / 130 * 0.6, rv.boostT > 0 ? 1 : (rv.padT > 0 ? 0.3 : 0), Math.max(0, rv.flash), rv.energy < 25 ? 0.6 : 0); }
  if (ghost.mesh && ghost.mesh.visible && ghost.data && race.state === 'race') { const i = Math.min(ghost.data.frames.length / 5 - 1, Math.floor(race.time * GHOST_HZ)) * 5, f = ghost.data.frames; placeMachine(ghost.mesh, f[i], f[i + 1], f[i + 2], f[i + 3], 0, 0); }
  for (const mn of tr.mines) { mn.mesh.visible = mn.cool <= 0; const l = mn.mesh.children[mn.mesh.children.length - 1]; l.visible = Math.floor(bobT * 4) % 2 === 0; }
  for (const mv of world.movers) mv(performance.now());
  fx.update(dt);
  if (race.state === 'intro') {} else if (race.state === 'select' || race.state === 'menus') updateSelectCamera(dt); else updateCamera(dt);
  const live = race.state === 'race' || race.state === 'countdown' || race.state === 'finished';
  setEngine(live ? P.v : 0, live ? P.thrust : 0, live ? P.boostP : 0, live);
  drawSpeedLines(race.state === 'race' ? clamp((P.v - 70) / 110, 0, 1) : 0, P.boostP);
  renderer.render(scene, camera);
}

// ---------- loop with watchdog (RAF can stall in embedded previews) ----------
let last = performance.now(), acc = 0, rafQueued = false, lastTick = 0, frames = 0;
function tick(now) {
  lastTick = now; let dt = Math.min(0.05, (now - last) / 1000); last = now; if (dt <= 0) dt = 0.001;
  const gp = navigator.getGamepads ? navigator.getGamepads()[0] : null;
  if (!pollPad(gp)) { const ev = pollGamepad(gp); if (ev && ev.start) onStart(); }
  if (race.state === 'intro') updateIntro(dt);
  acc += dt; let n = 0; while (acc >= DT && n++ < 8) { step(DT); acc -= DT; }
  updateHUD(dt); render(dt); frames++;
}
function frame(now) { rafQueued = false; tick(now); if (!rafQueued) { rafQueued = true; requestAnimationFrame(frame); } }
rafQueued = true; requestAnimationFrame(frame);
setInterval(() => { if (performance.now() - lastTick > 250) frame(performance.now()); }, 125);
addEventListener('gamepadconnected', () => ensureAudio());
document.getElementById('boot').remove();

// ---------- test seam ----------
window.__mc = {
  tr, player, get rivals() { return rivals; }, race, scene, camera, renderer, world, render, ROSTER, setPlayerMachine, prefs,
  start(mode = 'gp', diff = 'standard') { race.mode = mode; race.diff = DIFF[diff]; resetRace(); race.state = 'race'; race.countdown = 0; },
  fast(seconds) { const n = Math.round(seconds / DT); for (let i = 0; i < n; i++) { if (race.state !== 'race' && race.state !== 'finished') break; step(DT); } return this.snap(); },
  snap() { return { state: race.state, mode: race.mode, machine: player.m.name, time: +race.time.toFixed(2), lap: player.lap, laps: player.laps.map(t => +t.toFixed(2)), rank: race.rank, energy: +player.energy.toFixed(1), v: +player.v.toFixed(1), s: +player.s.toFixed(1), u: +player.u.toFixed(1), hits: player.hits, falls: player.falls, kos: race.kos, dead: rivals.filter(r => r.dead).length, frames, length: +tr.length.toFixed(0), rivalLaps: rivals.map(r => r.laps && r.laps.length ? +Math.min(...r.laps).toFixed(1) : null).filter(x => x).sort((a, b) => a - b) }; },
};
if (BOT && Q.get('auto') !== '0') { race.mode = 'gp'; race.diff = DIFF[Q.get('diff') || 'standard']; resetRace(); }
