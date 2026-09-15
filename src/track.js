// MUTE CITY — track: a closed spline sampled at uniform arc length, with a
// parallel-transported frame so the road can twist a full 360° and bank into
// bends. Everything that moves lives in TRACK SPACE: s (metres along the lap),
// u (lateral, +right), n (height above the surface). toWorld() maps back.
import * as THREE from '../vendor/three.module.js';

const SXZ = 0.5, SY = 1.0;
// [x, z, y, extraRoll (cumulative radians), halfWidth]
const CP = [
  [   0,    0,  40, 0, 24],   // 0  start / finish, heading +x
  [ 700,    0,  40, 0, 24],   // 1  pit straight (recharge strip)
  [1400,    0,  42, 0, 24],   // 2
  [1750,  150,  50, 0, 22],   // 3  Skyline Bend (wide right)
  [1900,  500,  60, 0, 22],   // 4
  [1750,  850,  68, 0, 22],   // 5
  [1400, 1000,  72, 0, 22],   // 6  heading -x
  [1100, 1000,  80, 0, 20],   // 7  TWIST begins
  [ 700, 1000, 105, Math.PI, 20],
  [ 300, 1000, 130, Math.PI * 2, 20],
  [-100, 1000, 145, Math.PI * 2, 22],  // 10 twist done
  [-400, 1000, 150, Math.PI * 2, 22],  // 11 Halfpipe (long banked bend)
  [-683, 1117, 150, Math.PI * 2, 22],
  [-800, 1400, 150, Math.PI * 2, 22],
  [-683, 1683, 148, Math.PI * 2, 22],
  [-400, 1800, 140, Math.PI * 2, 22],  // 15 heading +x
  [ 100, 1800, 110, Math.PI * 2, 20],  // 16 the Dive
  [ 600, 1800,  70, Math.PI * 2, 20],  // 17 jump gap sits in 16→17
  [ 850, 1900,  64, Math.PI * 2, 17],  // 18 Chicane
  [1050, 1780,  62, Math.PI * 2, 17],
  [1250, 1900,  60, Math.PI * 2, 17],
  [1450, 1780,  58, Math.PI * 2, 17],
  [1700, 1700,  56, Math.PI * 2, 20],  // 22
  [2400, 1600,  55, Math.PI * 2, 22],  // 23 Harbour Sweep
  [2700, 1000,  52, Math.PI * 2, 22],
  [2600,  300,  50, Math.PI * 2, 22],
  [2200, -300,  48, Math.PI * 2, 22],  // 26
  [1500, -480,  46, Math.PI * 2, 24],  // 27 back straight — NO RAILS
  [ 600, -500,  44, Math.PI * 2, 24],
  [-300, -500,  42, Math.PI * 2, 21],  // 29 Hairpin
  [-477, -427,  42, Math.PI * 2, 21],
  [-550, -250,  42, Math.PI * 2, 21],
  [-477,  -73,  41, Math.PI * 2, 21],
  [-300,    0,  40, Math.PI * 2, 24],  // 33 → back to 0
];
const NCP = CP.length;

// features are authored as (control index, fraction of that segment)
const FEATURES = {
  recharge: [[0, 0.25], [1, 0.05]],
  gap: [[16, 0.42], [16, 0.60]],
  norail: [[26, 0.35], [28, 0.95]],
  pads: [ // [idx, frac, lane (m, +right)]
    [1, 0.55, -11], [1, 0.55, 11],
    [7, 0.25, 0],
    [15, 0.45, -8], [15, 0.45, 8],
    [16, 0.18, 0],
    [22, 0.35, 0],
    [24, 0.5, -10], [24, 0.5, 10],
    [32, 0.4, 0],
  ],
  arches: [[2, 0.6], [6, 0.2], [9, 0.5], [13, 0.0], [17, 0.6], [23, 0.5], [25, 0.5], [28, 0.5]],
  names: [[3, 0.3, 'SKYLINE BEND'], [7, 0.2, 'THE TWIST'], [12, 0.2, 'HALFPIPE'], [16, 0.0, 'THE DIVE'], [18, 0.0, 'CHICANE'], [23, 0.4, 'HARBOUR SWEEP'], [29, 0.2, 'HAIRPIN']],
};

const BANK_GAIN = 110, BANK_MAX = 0.72, DS = 3.5;
const smooth01 = x => x * x * (3 - 2 * x);
const mkFrame = () => ({ p: new THREE.Vector3(), t: new THREE.Vector3(), n: new THREE.Vector3(), r: new THREE.Vector3() });

export function buildTrack() {
  const pts = CP.map(p => new THREE.Vector3(p[0] * SXZ, p[2] * SY, p[1] * SXZ));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
  // dense parameter → arc-length table
  const M0 = NCP * 300, cum = new Float64Array(M0 + 1);
  const a = curve.getPoint(0), b = new THREE.Vector3();
  for (let i = 1; i <= M0; i++) { curve.getPoint(i / M0, b); cum[i] = cum[i - 1] + b.distanceTo(a); a.copy(b); }
  const length = cum[M0];
  const wrap = s => ((s % length) + length) % length;
  const paramAtS = s => {
    s = wrap(s); let lo = 0, hi = M0;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    return (lo + (s - cum[lo]) / ((cum[lo + 1] - cum[lo]) || 1)) / M0;
  };
  const sAtParam = p => { const x = p * M0, i = Math.min(M0 - 1, Math.floor(x)); return cum[i] + (cum[i + 1] - cum[i]) * (x - i); };
  const sOf = (idx, frac) => sAtParam((((idx + frac) % NCP) + NCP) % NCP / NCP);
  const cpLerp = (p, col) => { const x = p * NCP, i0 = Math.floor(x) % NCP, i1 = (i0 + 1) % NCP, f = smooth01(x - Math.floor(x)); return CP[i0][col] + (CP[i1][col] - CP[i0][col]) * f; };
  const rollAt = p => { const x = p * NCP, i0 = Math.floor(x) % NCP, i1 = (i0 + 1) % NCP, f = smooth01(x - Math.floor(x)); const r0 = CP[i0][3]; let r1 = CP[i1][3]; if (i1 === 0) r1 = r0; return r0 + (r1 - r0) * f; };

  const N = Math.floor(length / DS), ds = length / N;
  const pos = [], T = [], Nn = [], R = [], hw = new Float32Array(N), kRaw = new Float32Array(N), sArr = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const s = i * ds, p = paramAtS(s);
    sArr[i] = s; pos.push(curve.getPoint(p)); T.push(curve.getTangent(p).normalize()); hw[i] = cpLerp(p, 4);
  }
  // parallel transport of the normal, then close the loop by spreading the holonomy
  const up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
  const n0 = up.clone().addScaledVector(T[0], -up.dot(T[0])).normalize(); Nn.push(n0);
  for (let i = 1; i < N; i++) { const n = Nn[i - 1].clone(); n.addScaledVector(T[i], -n.dot(T[i])).normalize(); Nn.push(n); }
  const nc = Nn[N - 1].clone(); nc.addScaledVector(T[0], -nc.dot(T[0])).normalize();
  const hol = Math.atan2(tmp.crossVectors(n0, nc).dot(T[0]), n0.dot(nc));
  for (let i = 0; i < N; i++) Nn[i].applyAxisAngle(T[i], -hol * i / N);
  // signed curvature about the transported normal (k>0 = left turn)
  for (let i = 0; i < N; i++) { const j = (i + 1) % N; kRaw[i] = tmp.crossVectors(T[i], T[j]).dot(Nn[i]) / ds; }
  const box = (src, w) => { const out = new Float32Array(N); for (let i = 0; i < N; i++) { let acc = 0; for (let d = -w; d <= w; d++) acc += src[(i + d + N) % N]; out[i] = acc / (2 * w + 1); } return out; };
  const k = box(kRaw, 4), kBank = box(kRaw, 22);
  const roll = new Float32Array(N), bank = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    bank[i] = -Math.max(-BANK_MAX, Math.min(BANK_MAX, kBank[i] * BANK_GAIN));
    roll[i] = rollAt(paramAtS(sArr[i])) + bank[i];
    Nn[i].applyAxisAngle(T[i], roll[i]);
    R.push(new THREE.Vector3().crossVectors(T[i], Nn[i]).normalize());
  }
  const idx = s => { const x = wrap(s) / ds; const i = Math.floor(x); return [i % N, (i + 1) % N, x - i]; };
  const F = mkFrame();
  const track = {
    length, N, ds, pos, T, Nrm: Nn, R, hw, k, bank, s: sArr, wrap, sOf, CP, SXZ, SY, curve, mkFrame,
    halfW(s) { const [i, j, f] = idx(s); return hw[i] + (hw[j] - hw[i]) * f; },
    curv(s) { const [i, j, f] = idx(s); return k[i] + (k[j] - k[i]) * f; },
    // interpolated frame; writes into out = {p,t,n,r}
    frame(s, out) { const [i, j, f] = idx(s); out.p.lerpVectors(pos[i], pos[j], f); out.t.lerpVectors(T[i], T[j], f).normalize(); out.n.lerpVectors(Nn[i], Nn[j], f).normalize(); out.r.lerpVectors(R[i], R[j], f).normalize(); return out; },
    toWorld(s, u, n, out) { this.frame(s, F); return out.copy(F.p).addScaledVector(F.r, u).addScaledVector(F.n, n); },
    // features in metres
    recharge: [sOf(...FEATURES.recharge[0]), sOf(...FEATURES.recharge[1])],
    gap: [sOf(...FEATURES.gap[0]), sOf(...FEATURES.gap[1])],
    norail: [sOf(...FEATURES.norail[0]), sOf(...FEATURES.norail[1])],
    pads: FEATURES.pads.map(([i, f, lane]) => ({ s: sOf(i, f), lane })),
    arches: FEATURES.arches.map(([i, f]) => sOf(i, f)),
    names: FEATURES.names.map(([i, f, name]) => ({ s: sOf(i, f), name })),
    inRange(s, r) { s = wrap(s); return r[0] <= r[1] ? (s >= r[0] && s <= r[1]) : (s >= r[0] || s <= r[1]); },
    onRecharge(s) { return this.inRange(s, this.recharge); },
    inGap(s) { return this.inRange(s, this.gap); },
    hasRail(s) { return !this.inRange(s, this.norail); },
  };
  return track;
}

// ---------- geometry ----------
export function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; }

export function buildTrackMeshes(tr) {
  const g = new THREE.Group();
  const { N, pos, R, Nrm: Nn, hw, ds } = tr;
  // road ribbon
  const roadTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#1a1c2c'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { c.fillStyle = `rgba(${40 + Math.random() * 40 | 0},${40 + Math.random() * 40 | 0},${70 + Math.random() * 40 | 0},${Math.random() * 0.35})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    c.fillStyle = '#2c3050'; c.fillRect(0, 0, w, 3); c.fillRect(0, h - 3, w, 3);
    c.fillStyle = 'rgba(120,140,255,0.55)'; c.fillRect(w * 0.5 - 1, 0, 2, h * 0.42);
    c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(w * 0.25 - 1, 0, 1, h); c.fillRect(w * 0.75 - 1, 0, 1, h);
  });
  const vs = [], uvs = [], ids = [];
  for (let i = 0; i <= N; i++) {
    const q = i % N;
    const L = pos[q].clone().addScaledVector(R[q], -hw[q]), Rt = pos[q].clone().addScaledVector(R[q], hw[q]);
    vs.push(L.x, L.y, L.z, Rt.x, Rt.y, Rt.z); uvs.push(0, i * ds / 24, 1, i * ds / 24);
  }
  for (let i = 0; i < N; i++) {
    if (tr.inGap(tr.s[i] + ds * 0.5)) continue;
    const j = i + 1;
    ids.push(i * 2, i * 2 + 1, j * 2, i * 2 + 1, j * 2 + 1, j * 2);
  }
  const road = new THREE.BufferGeometry();
  road.setAttribute('position', new THREE.Float32BufferAttribute(vs, 3)); road.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); road.setIndex(ids); road.computeVertexNormals();
  g.add(new THREE.Mesh(road, new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.75, metalness: 0.15, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: roadTex, emissiveIntensity: 0.55 })));

  // rails (translucent energy barriers) and edge lights
  const railMat = new THREE.MeshBasicMaterial({ color: 0x35c8ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xbff4ff, side: THREE.DoubleSide });
  const warnMat = new THREE.MeshBasicMaterial({ color: 0xff2a5a, side: THREE.DoubleSide });
  const strip = (side, pick, mat, h0, h1, wOff0, wOff1) => {
    const v = [], id = [];
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N, ok = pick(tr.s[i]) && !tr.inGap(tr.s[i]) && pick(tr.s[j]) && !tr.inGap(tr.s[j]);
      if (!ok) continue;
      for (const q of [i, j]) {
        const e = pos[q].clone().addScaledVector(R[q], side * (hw[q] + wOff0)).addScaledVector(Nn[q], h0);
        const f = pos[q].clone().addScaledVector(R[q], side * (hw[q] + wOff1)).addScaledVector(Nn[q], h1);
        v.push(e.x, e.y, e.z, f.x, f.y, f.z);
      }
      const b = v.length / 3 - 4; id.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
    if (!v.length) return;
    const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); ge.setIndex(id); ge.computeVertexNormals();
    g.add(new THREE.Mesh(ge, mat));
  };
  for (const side of [-1, 1]) {
    strip(side, s => tr.hasRail(s), railMat, 0.05, 3.2, 0.2, 0.2);
    strip(side, s => tr.hasRail(s), lightMat, 3.2, 3.2, -0.2, 0.7);
    strip(side, s => tr.hasRail(s), lightMat, 0.08, 0.08, -0.9, 0.0);
    strip(side, s => !tr.hasRail(s), warnMat, 0.08, 0.08, -1.2, 0.0);
  }
  // recharge strip (pink) — nearly full width, low glow. side=1, offsets measured from the right edge.
  strip(1, s => tr.onRecharge(s), new THREE.MeshBasicMaterial({ color: 0xff4fd8, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }), 0.12, 0.12, -2 * hw[0] + 2, -2);
  // start line
  const startTex = canvasTex(128, 32, (c) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { c.fillStyle = (x + y) % 2 ? '#f0f0f0' : '#101018'; c.fillRect(x * 8, y * 8, 8, 8); } });
  { const f = mkFrame(); tr.frame(0, f); const m = new THREE.Mesh(new THREE.PlaneGeometry(hw[0] * 2, 8), new THREE.MeshBasicMaterial({ map: startTex })); m.matrixAutoUpdate = false; m.matrix.makeBasis(f.r, f.t, f.n).setPosition(f.p.clone().addScaledVector(f.n, 0.15)); g.add(m); }
  // boost pads
  const padTex = canvasTex(64, 128, (c, w) => { c.fillStyle = '#ff7a10'; c.fillRect(0, 0, w, 128); c.fillStyle = '#ffe66a'; for (let y = 0; y < 3; y++) { c.beginPath(); c.moveTo(4, y * 40 + 30); c.lineTo(w / 2, y * 40 + 4); c.lineTo(w - 4, y * 40 + 30); c.lineTo(w - 4, y * 40 + 40); c.lineTo(w / 2, y * 40 + 14); c.lineTo(4, y * 40 + 40); c.fill(); } });
  const padMat = new THREE.MeshBasicMaterial({ map: padTex, side: THREE.DoubleSide });
  const padGeo = new THREE.PlaneGeometry(9, 14);
  for (const pd of tr.pads) { const f = mkFrame(); tr.frame(pd.s, f); const m = new THREE.Mesh(padGeo, padMat); m.matrixAutoUpdate = false; m.matrix.makeBasis(f.r, f.t, f.n).setPosition(f.p.clone().addScaledVector(f.r, pd.lane).addScaledVector(f.n, 0.18)); g.add(m); }
  // arches: torus rings around the road, alternating cyan / magenta
  tr.arches.forEach((s, i) => { const f = mkFrame(); tr.frame(s, f); const m = new THREE.Mesh(new THREE.TorusGeometry(tr.halfW(s) + 9, 1.4, 8, 40), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff46d6 : 0x36e0ff })); m.matrixAutoUpdate = false; m.matrix.makeBasis(f.r, f.n, f.t).setPosition(f.p.clone().addScaledVector(f.n, 6)); g.add(m); });
  // start gantry
  { const f = mkFrame(); tr.frame(2, f); const w = hw[0];
    const pill = new THREE.BoxGeometry(2.4, 24, 2.4), pm = new THREE.MeshStandardMaterial({ color: 0x8890b0, roughness: 0.5, metalness: 0.5 });
    for (const side of [-1, 1]) { const m = new THREE.Mesh(pill, pm); m.matrixAutoUpdate = false; m.matrix.makeBasis(f.r, f.n, f.t).setPosition(f.p.clone().addScaledVector(f.r, side * (w + 5)).addScaledVector(f.n, 12)); g.add(m); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 14, 4, 3), pm); beam.matrixAutoUpdate = false; beam.matrix.makeBasis(f.r, f.n, f.t).setPosition(f.p.clone().addScaledVector(f.n, 22)); g.add(beam);
    const signTex = canvasTex(1024, 128, (c, wd, hd) => { c.fillStyle = '#12061e'; c.fillRect(0, 0, wd, hd); c.font = 'italic 900 92px "Arial Black", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#ff3fd0'; c.shadowColor = '#ff3fd0'; c.shadowBlur = 24; c.fillText('MUTE CITY', wd / 2, hd / 2 + 4); c.shadowBlur = 0; c.fillStyle = '#7ff3ff'; c.font = '700 26px Arial, sans-serif'; c.fillText('TWIST ROAD', wd / 2, hd - 18); });
    for (const side of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w * 2 + 10, 6), new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide })); m.matrixAutoUpdate = false; m.matrix.makeBasis(f.r.clone().multiplyScalar(-side), f.n, f.t.clone().multiplyScalar(-side)).setPosition(f.p.clone().addScaledVector(f.n, 17).addScaledVector(f.t, side * 1.6)); g.add(m); }
  }
  return g;
}
