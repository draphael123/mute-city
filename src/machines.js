// MUTE CITY — the 30-machine roster (stats + silhouettes) and the mesh builder.
// Local axes: +Z forward, +Y up, +X right. Grades A..E as in GX.
import * as THREE from '../vendor/three.module.js';

// shape archetypes: how the hull, pods, wings and fins are proportioned
const SHAPES = {
  falcon:   { L: 8.6, W: 1.15, H: 0.5, p: 0.75, pods: 2, podR: 0.62, podL: 4.6, podX: 2.35, wingW: 2.5, wingZ: -0.6, fin: 1.5, twinFin: true,  canopyZ: 1.2, canards: true },
  fox:      { L: 9.4, W: 0.95, H: 0.45, p: 0.55, pods: 2, podR: 0.5, podL: 3.6, podX: 1.9, wingW: 1.6, wingZ: -1.8, fin: 2.6, twinFin: false, canopyZ: 0.6 },
  goose:    { L: 7.6, W: 1.6, H: 0.7, p: 1.1, pods: 4, podR: 0.55, podL: 4.0, podX: 2.5, wingW: 1.6, wingZ: -0.4, fin: 1.0, twinFin: true,  canopyZ: 1.0 },
  stingray: { L: 8.0, W: 1.3, H: 0.42, p: 0.9, pods: 2, podR: 0.5, podL: 3.2, podX: 3.6, wingW: 4.2, wingZ: -0.2, fin: 0.8, twinFin: true,  canopyZ: 1.4, delta: true },
  cat:      { L: 9.0, W: 0.8, H: 0.42, p: 0.6, pods: 2, podR: 0.42, podL: 5.0, podX: 1.6, wingW: 1.2, wingZ: -1.0, fin: 1.4, twinFin: false, canopyZ: 1.8 },
  bull:     { L: 8.4, W: 1.7, H: 0.8, p: 1.3, pods: 2, podR: 0.9, podL: 5.2, podX: 2.9, wingW: 1.8, wingZ: -0.8, fin: 1.2, twinFin: true,  canopyZ: 0.4, blunt: true },
  gazelle:  { L: 7.8, W: 1.2, H: 0.55, p: 0.85, pods: 0, podR: 0.5, podL: 3, podX: 2, wingW: 2.0, wingZ: -0.9, fin: 1.8, twinFin: false, canopyZ: 1.1, ring: true },
  phantom:  { L: 8.2, W: 1.0, H: 0.4, p: 0.7, pods: 2, podR: 0.45, podL: 3.0, podX: 3.0, wingW: 3.4, wingZ: -1.2, fin: 0.6, twinFin: true,  canopyZ: 1.5, delta: true },
};
// [name, pilot, color, accent, body, boost, grip, weight(kg), shape]
const R = [
  ['BLUE FALCON', 'CAPT. FALCON', 0x2255ff, 0xffd400, 'B', 'B', 'B', 1260, 'falcon'],
  ['GOLDEN FOX', 'DR. STEWART', 0xffc400, 0xffffff, 'E', 'A', 'D', 1420, 'fox'],
  ['WILD GOOSE', 'PICO', 0x3c8a4a, 0xd8d8d8, 'A', 'C', 'B', 1620, 'goose'],
  ['FIRE STINGRAY', 'SAMURAI GOROH', 0xd02a4a, 0xffe070, 'A', 'B', 'D', 1960, 'stingray'],
  ['WHITE CAT', 'JODY SUMMER', 0xf0f0f0, 0xff3c8c, 'C', 'B', 'A', 1150, 'cat'],
  ['BLACK BULL', 'BLACK SHADOW', 0x181826, 0xff2020, 'A', 'E', 'A', 2340, 'bull'],
  ['RED GAZELLE', 'MIGHTY GAZELLE', 0xe03030, 0xffffff, 'C', 'B', 'D', 1330, 'gazelle'],
  ['SONIC PHANTOM', 'THE SKULL', 0x8060ff, 0x40ffe0, 'D', 'A', 'C', 1120, 'phantom'],
  ['HYPER SPEEDER', 'BEASTMAN', 0xf0a020, 0x202030, 'B', 'C', 'B', 1560, 'goose'],
  ['GREAT STAR', 'MR. EAD', 0x30c0e0, 0xffffff, 'D', 'B', 'C', 1300, 'phantom'],
  ['KING METEOR', 'SUPER ARROW', 0xff8080, 0xffffff, 'B', 'D', 'A', 1240, 'cat'],
  ['QUEEN METEOR', 'MRS. ARROW', 0xff60c0, 0xffffff, 'C', 'C', 'A', 1220, 'cat'],
  ['TWIN NORITTA', 'GOMAR & SHIOH', 0x30e090, 0x104030, 'C', 'B', 'C', 1400, 'goose'],
  ['NIGHT THUNDER', 'SILVER NEELSEN', 0x203070, 0x60a0ff, 'B', 'B', 'D', 1700, 'fox'],
  ['WILD BOAR', 'MICHAEL CHAIN', 0x8a6030, 0xffd080, 'A', 'D', 'C', 1850, 'bull'],
  ['BLOOD HAWK', 'BLOOD FALCON', 0xc01020, 0x101010, 'B', 'A', 'C', 1300, 'falcon'],
  ['WONDER WASP', 'JOHN TANAKA', 0xffd000, 0x202020, 'D', 'C', 'B', 1100, 'gazelle'],
  ['MIGHTY TYPHOON', 'DRAQ', 0x20a0ff, 0xffffff, 'C', 'A', 'D', 1450, 'stingray'],
  ['MIGHTY HURRICANE', 'ROGER BUSTER', 0x4060ff, 0xffe000, 'B', 'B', 'C', 1520, 'stingray'],
  ['CRAZY BEAR', 'DR. CLASH', 0x8090a0, 0xff6000, 'A', 'C', 'E', 2100, 'bull'],
  ['IRON TIGER', 'BABA', 0xe0a030, 0x303030, 'B', 'C', 'C', 1480, 'falcon'],
  ['DEATH ANCHOR', 'ZODA', 0x6020a0, 0x20ff80, 'E', 'A', 'B', 1080, 'fox'],
  ['ASTRO ROBIN', 'JACK LEVIN', 0x30a0ff, 0xffffff, 'C', 'C', 'B', 1290, 'gazelle'],
  ['BIG FANG', 'BIO REX', 0x40c040, 0x203020, 'A', 'B', 'D', 1780, 'goose'],
  ['GREEN PANTHER', 'ANTONIO GUSTER', 0x20a050, 0xa0ffc0, 'C', 'B', 'B', 1400, 'phantom'],
  ['SPACE ANGLER', 'LEON', 0xa0e0ff, 0x2040a0, 'D', 'C', 'A', 1180, 'cat'],
  ['DEEP CLAW', 'OCTOMAN', 0xd050d0, 0x40ffe0, 'C', 'D', 'B', 1500, 'gazelle'],
  ['MAD WOLF', 'BILLY', 0x808080, 0xff4040, 'B', 'C', 'C', 1540, 'falcon'],
  ['SUPER PIRANHA', 'KATE ALEN', 0xff70c0, 0x400040, 'C', 'B', 'C', 1360, 'phantom'],
  ['LITTLE WYVERN', 'JAMES McCLOUD', 0xd0d0e0, 0x2050ff, 'E', 'B', 'A', 1000, 'fox'],
];
const G = { A: 0, B: 1, C: 2, D: 3, E: 4 };
const BODY_MUL = [0.6, 0.75, 0.9, 1.05, 1.25];          // damage taken multiplier
const BOOST_TOP = [64, 56, 48, 42, 36];                  // m/s added to top speed at full boost
const BOOST_ACC = [95, 84, 74, 65, 57];
const BOOST_DRAIN = [20, 22, 24, 26, 28];                // energy per second while boosting
const GRIP = [7.0, 6.2, 5.5, 4.8, 4.2];                  // slip damping /s
const AMAX = [110, 100, 90, 80, 70];                       // lateral acceleration ceiling m/s^2
const YAW = [1.0, 0.96, 0.92, 0.88, 0.84];

export const ROSTER = R.map(([name, pilot, color, accent, body, boost, grip, weight, shape], i) => ({
  i, name, pilot, color, accent, body, boost, grip, weight, shape,
  bodyMul: BODY_MUL[G[body]], boostTop: BOOST_TOP[G[boost]], boostAcc: BOOST_ACC[G[boost]], boostDrain: BOOST_DRAIN[G[boost]],
  gripK: GRIP[G[grip]], aMax: AMAX[G[grip]], yawMul: YAW[G[grip]],
  top: 122 + (weight - 1200) / 62, acc: 46 * Math.sqrt(1300 / weight),
}));
// balance slider b in [-1 (accel), +1 (top speed)] → concrete numbers for a machine
export function tuned(m, b = 0) { return { ...m, TOP: m.top * (1 + 0.06 * b), ACC: m.acc * (1 - 0.25 * b), balance: b }; }

const cache = {};
function shapeGeos(key) {
  if (cache[key]) return cache[key];
  const sh = SHAPES[key]; const g = {};
  const prof = []; for (let i = 0; i <= 12; i++) { const t = i / 12; const r = 1.5 * Math.sin(Math.PI * Math.pow(t, sh.p)) + 0.14; prof.push(new THREE.Vector2(r, (t - 0.5) * sh.L)); }
  g.body = new THREE.LatheGeometry(prof, 14); g.body.scale(sh.W, sh.H, 1);
  if (sh.blunt) { g.body = new THREE.BoxGeometry(3.2 * sh.W, 1.2, sh.L * 0.9); }
  g.pod = new THREE.CylinderGeometry(sh.podR, sh.podR * 1.25, sh.podL, 10); g.pod.rotateX(Math.PI / 2);
  g.podNose = new THREE.ConeGeometry(sh.podR, sh.podR * 2.2, 10); g.podNose.rotateX(Math.PI / 2);
  g.canopy = new THREE.SphereGeometry(0.75, 12, 8); g.canopy.scale(0.9, 0.55, 1.6);
  g.fin = new THREE.BoxGeometry(0.16, sh.fin, 2.2);
  g.wing = sh.delta ? (() => { const s = new THREE.Shape(); s.moveTo(0, 2.2); s.lineTo(sh.wingW, -1.6); s.lineTo(0, -1.2); s.lineTo(-sh.wingW, -1.6); s.closePath(); const e = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: false }); e.rotateX(Math.PI / 2); return e; })() : new THREE.BoxGeometry(sh.wingW, 0.12, 1.6);
  g.thr = new THREE.CircleGeometry(0.5, 12);
  g.flame = new THREE.ConeGeometry(0.55, 5, 10, 1, true); g.flame.rotateX(-Math.PI / 2); g.flame.translate(0, 0, -2.5);
  g.canard = new THREE.BoxGeometry(1.2, 0.08, 0.7);
  g.ring = new THREE.TorusGeometry(2.2, 0.22, 8, 24);
  return cache[key] = g;
}
const shared = {};
function mats() {
  if (shared.glow) return shared;
  shared.glow = new THREE.MeshBasicMaterial({ color: 0x6fd0ff });
  shared.flame = new THREE.MeshBasicMaterial({ color: 0x3f8cff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  shared.boost = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  shared.canopy = new THREE.MeshStandardMaterial({ color: 0x102040, roughness: 0.15, metalness: 0.6, emissive: 0x1a3a70, emissiveIntensity: 0.6 });
  return shared;
}

export function makeMachine(m, opts = {}) {
  const sh = SHAPES[m.shape], Gs = shapeGeos(m.shape), M = mats(), g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: m.color, roughness: 0.6, metalness: 0.15, emissive: m.color, emissiveIntensity: 0.18, transparent: !!opts.ghost, opacity: opts.ghost ? 0.35 : 1 });
  const accent = new THREE.MeshStandardMaterial({ color: m.accent, roughness: 0.4, metalness: 0.3, emissive: m.accent, emissiveIntensity: 0.35, transparent: !!opts.ghost, opacity: opts.ghost ? 0.35 : 1 });
  g.userData = { paint, accent, flames: [], boosts: [], m };
  g.add(new THREE.Mesh(Gs.body, paint));
  if (sh.blunt) { const nose = new THREE.Mesh(new THREE.ConeGeometry(1.7 * sh.W, 2.4, 4), accent); nose.rotation.set(Math.PI / 2, 0, Math.PI / 4); nose.position.set(0, 0, sh.L * 0.45 + 1.1); g.add(nose); }
  const canopy = new THREE.Mesh(Gs.canopy, M.canopy); canopy.position.set(0, 0.62 * (sh.H / 0.5), sh.canopyZ); g.add(canopy);
  const wing = new THREE.Mesh(Gs.wing, paint); wing.position.set(0, -0.1, sh.wingZ); g.add(wing);
  if (sh.ring) { const r = new THREE.Mesh(Gs.ring, accent); r.position.set(0, 0.2, -1.4); g.add(r); }
  for (const sx of [-1, 1]) {
    if (sh.pods >= 2) {
      const pod = new THREE.Mesh(Gs.pod, accent); pod.position.set(sx * sh.podX, -0.15, -0.6); g.add(pod);
      const pn = new THREE.Mesh(Gs.podNose, paint); pn.position.set(sx * sh.podX, -0.15, sh.podL / 2 - 0.6 + sh.podR * 1.1); g.add(pn);
      const thr = new THREE.Mesh(Gs.thr, M.glow); thr.position.set(sx * sh.podX, -0.15, -sh.podL / 2 - 0.6); thr.rotation.y = Math.PI; thr.scale.setScalar(sh.podR / 0.6); g.add(thr);
      const fl = new THREE.Mesh(Gs.flame, M.flame); fl.position.copy(thr.position); fl.scale.set(sh.podR / 0.6, sh.podR / 0.6, 1); g.add(fl); g.userData.flames.push(fl);
      const bf = new THREE.Mesh(Gs.flame, M.boost); bf.position.copy(thr.position); bf.scale.set(1.6, 1.6, 0.01); g.add(bf); g.userData.boosts.push(bf);
    }
    if (sh.pods >= 4) { const pod = new THREE.Mesh(Gs.pod, accent); pod.position.set(sx * sh.podX * 0.55, 0.7, -1.6); pod.scale.setScalar(0.8); g.add(pod); }
    if (sh.twinFin) { const fin = new THREE.Mesh(Gs.fin, accent); fin.position.set(sx * 1.1, sh.fin / 2 + 0.2, -sh.L * 0.36); fin.rotation.z = -sx * 0.45; g.add(fin); }
    if (sh.canards) { const c = new THREE.Mesh(Gs.canard, accent); c.position.set(sx * 1.3, 0.1, sh.L * 0.3); g.add(c); }
  }
  if (!sh.twinFin) { const fin = new THREE.Mesh(Gs.fin, accent); fin.position.set(0, sh.fin / 2 + 0.2, -sh.L * 0.36); g.add(fin); }
  const mainThr = new THREE.Mesh(Gs.thr, M.glow); mainThr.position.set(0, 0, -sh.L * 0.5); mainThr.rotation.y = Math.PI; mainThr.scale.set(1.5, 1.5, 1); g.add(mainThr);
  const mf = new THREE.Mesh(Gs.flame, M.flame); mf.position.copy(mainThr.position); mf.scale.set(1.5, 1.5, 1); g.add(mf); g.userData.flames.push(mf);
  const mb = new THREE.Mesh(Gs.flame, M.boost); mb.position.copy(mainThr.position); mb.scale.set(2.2, 2.2, 0.01); g.add(mb); g.userData.boosts.push(mb);
  g.matrixAutoUpdate = false;
  return g;
}

// per-frame dressing: flame length, boost cones, damage flash, low-energy glow
export function dressMachine(g, thrust, boost, flash = 0, low = 0) {
  const u = g.userData;
  for (const f of u.flames) f.scale.z = 0.15 + thrust * 0.8;
  for (const b of u.boosts) b.scale.z = boost > 0 ? 0.5 + boost * 1.1 : 0.01;
  const base = 0.18 + flash * 2.5 + low * 0.5;
  u.paint.emissiveIntensity = base; u.accent.emissiveIntensity = 0.35 + flash * 2.5;
  if (low > 0 || flash > 0) { u.paint.emissive.setRGB(1, 0.25 + (1 - low) * 0.6, 0.25 + (1 - low) * 0.6); if (low === 0) u.paint.emissive.setHex(0xffffff); }
  else u.paint.emissive.setHex(u.m.color);
}
