// MUTE CITY — race loop. Player gets the physics; the 29 rivals run on rails.
import * as THREE from '../vendor/three.module.js';
import { buildTrack, buildTrackMeshes } from './track.js';
import { buildWorld } from './world.js';
import { makeMachine, dressMachine } from './machine.js';
import { ensureAudio, setEngine, sfx } from './audio.js';

const Q = new URLSearchParams(location.search);
const BOT = Q.get('bot') === '1';
const LAPS = 3, SPEED_DISPLAY = 2.4, DT = 1 / 120;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const sign = x => x < 0 ? -1 : 1;

// ---------- renderer / scene ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.5, 9000);
function resize() { const w = innerWidth || 1280, h = innerHeight || 720; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const tr = buildTrack();
scene.add(buildTrackMeshes(tr));
const world = buildWorld(scene, tr);

// ---------- machines ----------
const PILOTS = ['CAPT. FALCON', 'DR. STEWART', 'PICO', 'SAMURAI GOROH', 'JODY SUMMER', 'MIGHTY GAZELLE', 'BABA', 'OCTOMAN', 'MR. EAD', 'JAMES McCLOUD', 'BILLY', 'KATE ALEN', 'ZODA', 'JACK LEVIN', 'BIO REX', 'THE SKULL', 'ANTONIO GUSTER', 'BEASTMAN', 'LEON', 'SUPER ARROW', 'MRS. ARROW', 'GOMAR & SHIOH', 'SILVER NEELSEN', 'MICHAEL CHAIN', 'BLOOD FALCON', 'JOHN TANAKA', 'DRAQ', 'ROGER BUSTER', 'DR. CLASH', 'BLACK SHADOW'];
const COLORS = [[0x2255ff, 0xffd400], [0xf0f0f0, 0xff2050], [0xff8a00, 0x30e0ff], [0xc01030, 0xffe070], [0xff59d0, 0xffffff], [0xe8e8e8, 0x2f7cff], [0x8bff3a, 0x203040], [0xff4020, 0x101020], [0x30e090, 0xffffff], [0xffffff, 0x9a30ff], [0x9a30ff, 0x40ffe0], [0xff2050, 0xffffff], [0x101020, 0xff30a0], [0x40a0ff, 0xffffff], [0x606080, 0xff8000]];
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

const player = { name: 'YOU', s: 0, u: 0, n: 0, v: 0, h: 0, energy: 100, lap: 1, half: false, boost: 0, padT: 0, air: false, vn: 0, stun: 0, hitT: 0, laps: [], lapStart: 0, prog: 0, hits: 0, falls: 0, steer: 0, thrust: 0, drift: false, mesh: makeMachine(0x2255ff, 0xffd400), TOP: 128, ACC: 46, BRAKE: 70, STEER: 0.62, DM: 2.3, BLEED: 14, BOOST_TOP: 180, BOOST_ACC: 75, BOOST_DUR: 1.1, BOOST_COST: 15, PAD_KICK: 30, PAD_TOP: 172 };
scene.add(player.mesh);
const rivals = [];
for (let i = 0; i < 29; i++) {
  const c = COLORS[(i + 1) % COLORS.length];
  const rv = { name: PILOTS[i + 1], s: 0, u: 0, v: 0, lane: 0, uT: 0, top: 116 + rnd() * 16, agg: 0.82 + rnd() * 0.2, boostT: 0, boostCool: 3 + rnd() * 6, padT: 0, lapsDone: 0, prog: 0, avoid: 0, avoidT: 0, mesh: makeMachine(c[0], c[1]), color: c[0] };
  scene.add(rv.mesh); rivals.push(rv);
}
const everyone = [player, ...rivals];
const F = tr.mkFrame(), F2 = tr.mkFrame();
const _fwd = new THREE.Vector3(), _rt = new THREE.Vector3(), _up = new THREE.Vector3(), _rt2 = new THREE.Vector3(), _pos = new THREE.Vector3(), _m = new THREE.Matrix4();

function placeMachine(m, s, u, n, h, roll, bob) {
  tr.frame(s, F);
  _pos.copy(F.p).addScaledVector(F.r, u).addScaledVector(F.n, n + 1.1 + bob);
  _fwd.copy(F.t).multiplyScalar(Math.cos(h)).addScaledVector(F.r, -Math.sin(h));
  _rt.copy(F.r).multiplyScalar(Math.cos(h)).addScaledVector(F.t, Math.sin(h));
  _up.copy(F.n).multiplyScalar(Math.cos(roll)).addScaledVector(_rt, Math.sin(roll));
  _rt2.copy(_rt).multiplyScalar(Math.cos(roll)).addScaledVector(F.n, -Math.sin(roll));
  m.matrix.makeBasis(_rt2, _up, _fwd).setPosition(_pos); m.matrixWorldNeedsUpdate = true;
}

// ---------- race state ----------
const race = { state: 'title', t: 0, countdown: 0, time: 0, rank: 30, finalRank: 0, msg: '', msgT: 0, shake: 0, fade: 0, nameIdx: 0 };
const dsWrap = d => { const L = tr.length; d = ((d % L) + L) % L; return d > L / 2 ? d - L : d; };
function resetRace() {
  everyone.forEach((m, i) => { // grid: rows of 3, player in row 4 (P14 of 30)
    const slot = i === 0 ? 13 : (i <= 13 ? i - 1 : i); const row = Math.floor(slot / 3), lane = [-13, 0, 13][slot % 3];
    m.s = tr.wrap(-16 - row * 11); m.u = lane; m.v = 0; m.prog = m.s - tr.length;
    if (m === player) { Object.assign(m, { n: 0, h: 0, energy: 100, lap: 1, half: false, boost: 0, padT: 0, air: false, vn: 0, stun: 0, hitT: 0, laps: [], lapStart: 0, hits: 0, falls: 0 }); }
    else { m.lane = lane * 0.9; m.uT = m.lane; m.boostT = 0; m.padT = 0; m.lapsDone = -1; m.half = false; m.laps = []; m.lapStart = 0; m.boostCool = 3 + rnd() * 6; }
  });
  for (const pd of tr.pads) pd.cool = 0;
  race.state = 'countdown'; race.countdown = 3.999; race._cd = 4; race.time = 0; race.msg = ''; race.msgT = 0; race.fade = 0; race.nameIdx = 0;
  ui.end.hidden = true; ui.title.hidden = true;
}

// ---------- input ----------
const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault(); ensureAudio();
  if (race.state === 'title' && (e.code === 'Enter' || e.code === 'Space')) resetRace();
  if ((race.state === 'finished' || race.state === 'retired') && e.code === 'KeyR') resetRace();
  if (e.code === 'KeyR' && race.state === 'race' && e.shiftKey) resetRace(); });
addEventListener('keyup', e => { keys[e.code] = false; });
let boostLatch = false;
function readInput() {
  const gp = navigator.getGamepads ? navigator.getGamepads()[0] : null;
  let steer = (keys.ArrowLeft || keys.KeyA ? 1 : 0) - (keys.ArrowRight || keys.KeyD ? 1 : 0);
  let thr = keys.ArrowUp || keys.KeyW ? 1 : 0, brake = keys.ArrowDown || keys.KeyS ? 1 : 0;
  let drift = !!(keys.KeyQ || keys.KeyE || keys.ShiftLeft || keys.ShiftRight), boost = !!(keys.Space || keys.KeyX);
  if (gp) { const ax = gp.axes[0] || 0; if (Math.abs(ax) > 0.12) steer = -ax; if (gp.buttons[0]?.pressed || (gp.buttons[7]?.value || 0) > 0.2) thr = 1; if (gp.buttons[1]?.pressed || (gp.buttons[6]?.value || 0) > 0.2) brake = 1; if (gp.buttons[4]?.pressed || gp.buttons[5]?.pressed) drift = true; if (gp.buttons[2]?.pressed || gp.buttons[3]?.pressed) boost = true;
    if (race.state === 'title' && gp.buttons[9]?.pressed) resetRace(); if ((race.state === 'finished' || race.state === 'retired') && gp.buttons[9]?.pressed) resetRace(); }
  return { steer, thr, brake, drift, boost };
}

// ---------- bot (autopilot for verification) ----------
function botInput(P) {
  const look = 22 + P.v * 0.28, kNow = tr.curv(P.s), kA = tr.curv(P.s + look), kA2 = tr.curv(P.s + look * 2);
  let kMax = 0; for (let d = 0; d <= P.v * 1.6; d += 20) kMax = Math.max(kMax, Math.abs(tr.curv(P.s + 10 + d)));
  const hwm = tr.halfW(P.s + look) - 4.5;
  let uT = 0; if (Math.abs(kA) > 0.002) uT = -sign(kA) * hwm * 0.45 * Math.min(1, Math.abs(kA) * 200);
  const nearGap = Math.abs(dsWrap(tr.gap[0] - P.s)) < 160; if (nearGap) uT = 0;
  const hDes = clamp(Math.asin(clamp((P.u - uT) / look, -0.5, 0.5)), -0.32, 0.32);
  const need = Math.abs(P.v * kNow);
  const drift = !P.air && !nearGap && (need > 0.5 * P.STEER || Math.abs(hDes - P.h) > 0.22);
  const rate = P.STEER * (drift ? P.DM : 1);
  const steer = clamp((hDes - P.h) * 6 + P.v * kNow / rate, -1, 1);
  const vMax = kMax > 1e-4 ? 0.9 * P.STEER * P.DM / kMax : 999;
  const thr = P.v < vMax ? 1 : 0, brake = P.v > vMax * 1.06 ? 1 : 0;
  const boost = P.lap >= 2 && P.energy > 42 && Math.abs(kA) < 0.0015 && Math.abs(kA2) < 0.0025 && P.boost <= 0 && !P.air;
  return { steer, thr, brake, drift, boost };
}

// ---------- physics ----------
function fall(P, inGap) {
  P.stun = 1.6; P.energy -= 12; P.v = 35; P.u = 0; P.h = 0; P.air = false; P.n = 0; P.vn = 0; P.falls++;
  if (inGap) P.s = tr.wrap(tr.gap[1] + 12);
  race.fade = 1; sfx.fall(); toast('FELL OFF THE COURSE', 1.4);
  if (P.energy <= 0) retire();
}
function retire() { race.state = 'retired'; sfx.explode(); race.shake = 2.5; ui.endTitle.textContent = 'MACHINE DESTROYED'; ui.endBody.innerHTML = `Energy ran out.<br><span class="dim">Wall hits: ${player.hits} · Falls: ${player.falls}</span>`; ui.end.hidden = false; }
function toast(t, dur = 1.2) { race.msg = t; race.msgT = dur; }

function stepPlayer(P, inp, dt) {
  if (P.stun > 0) { P.stun -= dt; P.v = Math.max(0, P.v - 10 * dt); P.s = tr.wrap(P.s + P.v * dt); P.steer = 0; P.thrust = 0; return; }
  P.steer += (inp.steer - P.steer) * Math.min(1, dt * 14);
  P.thrust = inp.thr; P.drift = inp.drift;
  // boost
  if (inp.boost && !boostLatch && P.lap >= 2 && P.boost <= 0 && P.energy > 0 && race.state === 'race') { P.boost = P.BOOST_DUR; P.energy -= P.BOOST_COST; sfx.boost(); race.shake = Math.max(race.shake, 0.5); if (P.energy <= 0) { P.energy = 0; retire(); return; } }
  boostLatch = inp.boost;
  if (P.boost > 0) P.boost -= dt; if (P.padT > 0) P.padT -= dt; if (P.hitT > 0) P.hitT -= dt;
  // speed
  const top = P.boost > 0 ? P.BOOST_TOP : (P.padT > 0 ? P.PAD_TOP : P.TOP);
  const drag = P.ACC / (P.TOP * P.TOP);
  let acc = inp.thr * P.ACC + (P.boost > 0 ? P.BOOST_ACC : 0) - drag * P.v * P.v - (inp.thr ? 0 : 5) - inp.brake * P.BRAKE;
  if (inp.drift && Math.abs(P.steer) > 0.1) acc -= P.BLEED * Math.abs(P.steer);
  P.v += acc * dt; if (P.v < 0) P.v = 0; if (P.v > top) P.v = Math.max(top, P.v - 90 * dt);
  // heading in the road frame: the road turns under a machine that keeps its world heading
  const k = tr.curv(P.s);
  const rate = P.STEER * (inp.drift ? P.DM : 1) * (P.air ? 0.35 : 1);
  P.h += P.steer * rate * dt - P.v * k * dt;
  const al = (Math.abs(P.steer) > 0.05 ? 1.0 : 2.4) * (inp.drift ? 0.5 : 1);
  P.h -= P.h * al * dt; P.h = clamp(P.h, -0.7, 0.7);
  P.s = tr.wrap(P.s + P.v * Math.cos(P.h) * dt); P.u -= P.v * Math.sin(P.h) * dt;
  // jump gap
  if (!P.air && tr.inGap(P.s)) { P.air = true; P.vn = P.v * 0.14; P.n = 0; toast('JUMP', 0.6); }
  if (P.air) { P.vn -= 30 * dt; P.n += P.vn * dt; if (P.n <= 0) { if (tr.inGap(P.s)) { fall(P, true); return; } P.air = false; P.n = 0; P.vn = 0; race.shake = Math.max(race.shake, 0.35); } }
  // walls / edges
  const hwm = tr.halfW(P.s) - 1.9;
  if (!P.air && Math.abs(P.u) > hwm) {
    const side = sign(P.u);
    if (tr.hasRail(P.s)) {
      const impact = Math.max(0, -P.v * Math.sin(P.h) * side);
      P.u = side * hwm; P.h = -P.h * 0.25; P.hits++;
      P.energy -= 0.8 + impact * 0.32; P.v *= 1 - 0.05 - Math.min(0.25, impact * 0.006);
      race.shake = Math.max(race.shake, 0.3 + impact * 0.02); if (P.hitT <= 0) sfx.hit(impact / 30); P.hitT = 0.25;
      if (P.energy <= 0) { P.energy = 0; retire(); return; }
    } else if (Math.abs(P.u) > hwm + 3.5) { fall(P, false); return; }
  }
  // recharge + pads
  if (!P.air && tr.onRecharge(P.s)) P.energy = Math.min(100, P.energy + 45 * dt);
  for (const pd of tr.pads) { if (pd.cool > 0) pd.cool -= dt; if (!P.air && pd.cool <= 0 && Math.abs(dsWrap(P.s - pd.s)) < 7 && Math.abs(P.u - pd.lane) < 4.6) { P.v = Math.min(P.PAD_TOP, P.v + P.PAD_KICK); P.padT = 2.0; pd.cool = 0.8; sfx.pad(); race.shake = Math.max(race.shake, 0.25); } }
  // laps
  if (P.s > tr.length / 2 && P.s < tr.length * 0.85) P.half = true;
  P.prog = (P.lap - 1) * tr.length + P.s;
}
function stepRival(rv, dt) {
  const kA = Math.max(Math.abs(tr.curv(rv.s + rv.v * 0.5)), Math.abs(tr.curv(rv.s + 25 + rv.v * 1.0)));
  const vc = Math.min(rv.top * (rv.padT > 0 ? 1.3 : 1), rv.agg * 0.95 / (kA + 1e-5));
  const target = rv.boostT > 0 ? rv.top + 45 : vc;
  rv.v += clamp(target - rv.v, -55 * dt, (rv.boostT > 0 ? 70 : 40) * dt);
  const k = tr.curv(rv.s), hwr = tr.halfW(rv.s) - 3.2;
  let uT = rv.lane; if (Math.abs(k) > 0.002) uT = -sign(k) * hwr * 0.5 * Math.min(1, Math.abs(k) * 250) + rv.lane * 0.3;
  if (rv.avoidT > 0) { rv.avoidT -= dt; uT += rv.avoid * 7; }
  uT = clamp(uT, -hwr, hwr); rv.uT = uT;
  rv.u += clamp(uT - rv.u, -7 * dt, 7 * dt);
  const prev = rv.s; rv.s = tr.wrap(rv.s + rv.v * dt);
  if (rv.s < prev - tr.length / 2) { rv.lapsDone++; if (rv.lapsDone >= 1) (rv.laps ||= []).push(race.time - rv.lapStart); rv.lapStart = race.time; }
  if (rv.boostT > 0) rv.boostT -= dt; else if (rv.boostCool > 0) rv.boostCool -= dt; else if (rv.lapsDone >= 1 && kA < 0.0015 && rnd() < 0.5 * dt) { rv.boostT = 1.0; rv.boostCool = 5 + rnd() * 9; }
  if (rv.padT > 0) rv.padT -= dt;
  for (const pd of tr.pads) if (Math.abs(dsWrap(rv.s - pd.s)) < 7 && Math.abs(rv.u - pd.lane) < 4.6 && rv.padT <= 0.5) { rv.v += 22; rv.padT = 1.6; }
  rv.prog = rv.lapsDone * tr.length + rv.s;
}
function contacts(dt) {
  const P = player;
  for (let i = 0; i < rivals.length; i++) {
    const a = rivals[i];
    for (let j = i + 1; j < rivals.length; j++) { const b = rivals[j]; const ds = dsWrap(b.s - a.s); if (Math.abs(ds) > 10 || Math.abs(b.u - a.u) > 4.5) continue; const back = ds > 0 ? a : b, front = ds > 0 ? b : a; back.v = Math.min(back.v, front.v - 1); if (back.avoidT <= 0) { back.avoid = back.u > front.u ? 1 : -1; back.avoidT = 1.2; } }
    if (P.air || P.stun > 0 || race.state !== 'race') continue;
    const ds = dsWrap(a.s - P.s), du = a.u - P.u;
    if (a.touchT > 0) a.touchT -= dt;
    if (Math.abs(ds) < 9 && Math.abs(du) < 5.5 && a.touchT <= 0) { a.touchT = 0.4; const push = sign(du || (rnd() - 0.5)); P.u -= push * 2.4; a.u += push * 2.4; P.h += push * 0.06; P.energy -= 2; P.v *= 0.97; a.v *= 0.97; if (P.hitT <= 0) { sfx.hit(0.3); P.hitT = 0.3; } race.shake = Math.max(race.shake, 0.2); if (P.energy <= 0) { P.energy = 0; retire(); } }
  }
}
function step(dt) {
  const P = player;
  if (race.state === 'countdown') { race.countdown -= dt; const n = Math.ceil(race.countdown); if (n !== race._cd) { race._cd = n; if (n > 0) sfx.beep(false); else { sfx.beep(true); race.state = 'race'; P.lapStart = 0; toast('GO!', 0.8); } } P.thrust = readInput().thr; return; }
  if (race.state !== 'race' && race.state !== 'finished') return;
  race.time += dt;
  const inp = race.state === 'race' ? (BOT ? botInput(P) : readInput()) : { steer: 0, thr: 0, brake: 0.3, drift: false, boost: false };
  const prevS = P.s;
  stepPlayer(P, inp, dt);
  if (race.state === 'race' && P.half && P.s < prevS - tr.length / 2) { // crossed the line forward
    P.half = false; const lt = race.time - P.lapStart; P.laps.push(lt); P.lapStart = race.time; P.lap++; sfx.lap();
    if (P.lap > LAPS) { finish(); } else { toast(P.lap === 2 ? 'LAP 2 — BOOST READY' : 'FINAL LAP', 1.5); }
  }
  for (const rv of rivals) stepRival(rv, dt);
  contacts(dt);
  if (race.state === 'race') { let r = 1; for (const rv of rivals) if (rv.prog > P.prog) r++; race.rank = r; }
  // corner-name toasts
  const nm = tr.names[race.nameIdx % tr.names.length]; if (Math.abs(dsWrap(P.s - nm.s)) < 6 && P.v > 5) { toast(nm.name, 1.0); race.nameIdx++; }
}
function finish() {
  race.state = 'finished'; race.finalRank = race.rank; player.lap = LAPS;
  const fmt = t => `${Math.floor(t / 60)}'${(t % 60).toFixed(2).padStart(5, '0')}`;
  ui.endTitle.textContent = `FINISH — ${ordinal(race.rank)} PLACE`;
  ui.endBody.innerHTML = `Total ${fmt(race.time)}<br>${player.laps.map((t, i) => `Lap ${i + 1} <b>${fmt(t)}</b>`).join(' · ')}<br><span class="dim">Wall hits: ${player.hits} · Falls: ${player.falls} · Best lap ${fmt(Math.min(...player.laps))}</span>`;
  ui.end.hidden = false;
}
const ordinal = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');

// ---------- camera ----------
const camPos = new THREE.Vector3(), camUp = new THREE.Vector3(0, 1, 0), camLook = new THREE.Vector3(), _d = new THREE.Vector3();
let camInit = false;
function updateCamera(dt) {
  const P = player; tr.frame(P.s, F);
  const h = P.h * 0.45;
  _fwd.copy(F.t).multiplyScalar(Math.cos(h)).addScaledVector(F.r, -Math.sin(h));
  _pos.copy(F.p).addScaledVector(F.r, P.u).addScaledVector(F.n, P.n + 1.1);
  _d.copy(_pos).addScaledVector(_fwd, -(13 + P.v * 0.03)).addScaledVector(F.n, 4.6 + Math.max(0, P.n * 0.2));
  if (!camInit) { camPos.copy(_d); camUp.copy(F.n); camInit = true; }
  const a = 1 - Math.exp(-dt * 9), b = 1 - Math.exp(-dt * 7);
  camPos.lerp(_d, a); camUp.lerp(F.n, b).normalize();
  camLook.copy(_pos).addScaledVector(_fwd, 40).addScaledVector(F.n, 0.5);
  if (race.shake > 0) { race.shake = Math.max(0, race.shake - dt * 2.2); camPos.addScaledVector(F.r, (Math.random() - 0.5) * race.shake * 1.2).addScaledVector(F.n, (Math.random() - 0.5) * race.shake * 0.8); }
  camera.position.copy(camPos); camera.up.copy(camUp); camera.lookAt(camLook);
  const fov = 66 + P.v * 0.055 + (P.boost > 0 ? 12 : 0) + (P.padT > 0 ? 5 : 0);
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 6); camera.updateProjectionMatrix();
}

// ---------- HUD ----------
const $ = id => document.getElementById(id);
const ui = { speed: $('speed'), energy: $('energyFill'), energyWrap: $('energy'), lap: $('lap'), rank: $('rank'), boost: $('boost'), msg: $('msg'), times: $('times'), title: $('title'), end: $('end'), endTitle: $('endTitle'), endBody: $('endBody'), fade: $('fade'), mini: $('mini'), name: $('nameTag') };
const mini = ui.mini.getContext('2d'); const miniBase = document.createElement('canvas'); miniBase.width = miniBase.height = 170;
{ let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9; for (const p of tr.pos) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const sc = 150 / Math.max(maxX - minX, maxZ - minZ); mini.mx = x => 10 + (x - minX) * sc + (150 - (maxX - minX) * sc) / 2; mini.mz = z => 10 + (z - minZ) * sc + (150 - (maxZ - minZ) * sc) / 2;
  const c = miniBase.getContext('2d'); c.strokeStyle = 'rgba(120,230,255,0.9)'; c.lineWidth = 3; c.lineJoin = 'round'; c.beginPath(); tr.pos.forEach((p, i) => i ? c.lineTo(mini.mx(p.x), mini.mz(p.z)) : c.moveTo(mini.mx(p.x), mini.mz(p.z))); c.closePath(); c.stroke();
  c.fillStyle = '#fff'; c.fillRect(mini.mx(tr.pos[0].x) - 2, mini.mz(tr.pos[0].z) - 2, 5, 5); }
let hudFrame = 0;
function updateHUD(dt) {
  const P = player;
  ui.speed.textContent = Math.round(P.v * 3.6 * SPEED_DISPLAY);
  const e = Math.max(0, P.energy); ui.energy.style.width = e + '%'; ui.energy.style.background = e > 45 ? 'linear-gradient(90deg,#3cf0a0,#9bffdf)' : e > 20 ? 'linear-gradient(90deg,#ffc22e,#ffe58a)' : 'linear-gradient(90deg,#ff2a5a,#ff8aa0)';
  ui.energyWrap.classList.toggle('hit', P.hitT > 0); ui.energyWrap.classList.toggle('charge', tr.onRecharge(P.s) && !P.air && race.state === 'race');
  ui.lap.textContent = `LAP ${Math.min(P.lap, LAPS)}/${LAPS}`;
  ui.rank.innerHTML = `<b>${race.rank}</b><small>/${everyone.length}</small>`;
  ui.boost.textContent = P.lap >= 2 ? (P.boost > 0 ? 'BOOSTING' : 'BOOST READY') : 'BOOST LOCKED · LAP 1';
  ui.boost.className = P.lap >= 2 ? (P.boost > 0 ? 'on' : 'ready') : '';
  if (race.state === 'countdown') { const n = Math.ceil(race.countdown); ui.msg.textContent = n > 0 ? Math.min(3, n) : 'GO!'; ui.msg.classList.add('big'); }
  else if (race.msgT > 0) { race.msgT -= dt; ui.msg.textContent = race.msg; ui.msg.classList.toggle('big', race.msg === 'GO!'); }
  else ui.msg.textContent = '';
  const fmt = t => `${Math.floor(t / 60)}'${(t % 60).toFixed(2).padStart(5, '0')}`;
  ui.times.innerHTML = `<div>TIME <b>${fmt(race.time)}</b></div>` + P.laps.map((t, i) => `<div>L${i + 1} ${fmt(t)}</div>`).join('');
  race.fade = Math.max(0, race.fade - dt * 1.2); ui.fade.style.opacity = race.fade;
  if (hudFrame++ % 2 === 0) { mini.clearRect(0, 0, 170, 170); mini.drawImage(miniBase, 0, 0);
    for (const rv of rivals) { tr.frame(rv.s, F2); mini.fillStyle = '#ff6ad0'; mini.fillRect(mini.mx(F2.p.x) - 1.5, mini.mz(F2.p.z) - 1.5, 3, 3); }
    tr.frame(P.s, F2); mini.fillStyle = '#5cf2ff'; mini.beginPath(); mini.arc(mini.mx(F2.p.x), mini.mz(F2.p.z), 4, 0, 7); mini.fill(); mini.strokeStyle = '#fff'; mini.lineWidth = 1.5; mini.stroke(); }
  // nearest rival name tag (the one just ahead)
  let best = null, bd = 1e9; for (const rv of rivals) { const d = dsWrap(rv.s - P.s); if (d > 0 && d < bd) { bd = d; best = rv; } }
  ui.name.textContent = best && bd < 400 ? `▲ ${best.name} · ${Math.round(bd)} m` : '';
}

// ---------- render ----------
let bobT = 0;
function render(dt) {
  bobT += dt; const P = player;
  placeMachine(P.mesh, P.s, P.u, P.n, P.h, -(P.steer * 0.35 + P.h * 0.45), Math.sin(bobT * 7) * 0.08 * (P.v < 5 ? 1 : 0.4));
  dressMachine(P.mesh, P.thrust * 0.6 + P.v / P.TOP * 0.6, P.boost > 0 ? clamp(P.boost / P.BOOST_DUR, 0.3, 1) : (P.padT > 0 ? 0.35 : 0));
  P.mesh.visible = P.stun <= 0 || Math.floor(bobT * 20) % 2 === 0;
  for (const rv of rivals) { const k = tr.curv(rv.s); placeMachine(rv.mesh, rv.s, rv.u, 0, clamp((rv.uT - rv.u) * 0.01, -0.15, 0.15), -(k * rv.v * 0.15 + (rv.uT - rv.u) * 0.02), Math.sin(bobT * 6 + rv.s) * 0.06); dressMachine(rv.mesh, 0.5 + rv.v / 130 * 0.6, rv.boostT > 0 ? 1 : (rv.padT > 0 ? 0.3 : 0)); }
  for (const mv of world.movers) mv(performance.now());
  updateCamera(dt);
  setEngine(P.v, P.thrust, P.boost > 0 ? 1 : 0);
  renderer.render(scene, camera);
}

// ---------- loop with watchdog (RAF can stall in embedded previews) ----------
let last = performance.now(), acc = 0, rafQueued = false, lastTick = 0, frames = 0;
function tick(now) {
  lastTick = now; let dt = Math.min(0.05, (now - last) / 1000); last = now; if (dt <= 0) dt = 0.001;
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
  tr, player, rivals, race, scene, camera, renderer, world, render, start() { resetRace(); race.state = 'race'; race.countdown = 0; },
  fast(seconds) { const n = Math.round(seconds / DT); const inp0 = BOT; for (let i = 0; i < n; i++) { if (race.state !== 'race' && race.state !== 'finished') break; step(DT); } return this.snap(); },
  snap() { return { state: race.state, time: +race.time.toFixed(2), lap: player.lap, laps: player.laps.map(t => +t.toFixed(2)), rank: race.rank, energy: +player.energy.toFixed(1), v: +player.v.toFixed(1), s: +player.s.toFixed(1), u: +player.u.toFixed(1), hits: player.hits, falls: player.falls, frames, length: +tr.length.toFixed(0), rivalLaps: rivals.map(r => r.laps && r.laps.length ? +Math.min(...r.laps).toFixed(1) : null).filter(x => x).sort((a, b) => a - b) }; },
};
if (BOT && Q.get('auto') !== '0') { resetRace(); }
