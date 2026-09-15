// MUTE CITY — the city under and around the road: sky, ground grid, instanced
// neon towers kept clear of the racing corridor, floating billboards, traffic.
import * as THREE from '../vendor/three.module.js';
import { canvasTex } from './track.js';

let seed = 1337; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

const ADS = ['FALCON FLIGHTS', 'AG MOTORS', 'PORT TOWN', 'GALAXY DRINK', 'BIG BLUE', 'CAPT. RADIO', 'MUTE CITY', 'DASH PLATE', 'STARLIGHT', 'HYPER HOTEL', 'ZERO-G LOUNGE', 'NEON NOODLE', 'SKYWAY 9', 'LUNAR EXPRESS'];
const ADCOL = ['#ff3fd0', '#36e0ff', '#ffd23f', '#7cff5a', '#ff7a10', '#a56bff'];

export function buildWorld(scene, tr) {
  const world = { movers: [] };
  // ---- sky ----
  const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: {},
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 top = vec3(0.02,0.01,0.09); vec3 hor = vec3(0.30,0.05,0.34); vec3 glow = vec3(0.9,0.25,0.6); float t = clamp(h*1.6+0.15,0.0,1.0); vec3 c = mix(hor, top, pow(t,0.6)); c += glow * exp(-abs(h-0.02)*22.0) * 0.5; gl_FragColor = vec4(c,1.0); }' });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(7000, 24, 16), skyMat); sky.frustumCulled = false; scene.add(sky);
  { const n = 1800, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, e = Math.asin(rnd() * 0.95 + 0.05), r = 6500; p[i * 3] = Math.cos(a) * Math.cos(e) * r; p[i * 3 + 1] = Math.sin(e) * r; p[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdde6ff, size: 9, sizeAttenuation: true, fog: false }))); }
  // a ringed planet on the horizon
  { const pl = new THREE.Mesh(new THREE.SphereGeometry(520, 32, 24), new THREE.MeshBasicMaterial({ color: 0x5d7cff, fog: false })); pl.position.set(-1600, 900, -4800); scene.add(pl);
    const ring = new THREE.Mesh(new THREE.RingGeometry(700, 1050, 64), new THREE.MeshBasicMaterial({ color: 0xa9b8ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, fog: false })); ring.position.copy(pl.position); ring.rotation.set(1.2, 0.3, 0.6); scene.add(ring); }

  // ---- lights + fog ----
  scene.fog = new THREE.FogExp2(0x0d0620, 0.00042);
  scene.add(new THREE.HemisphereLight(0x6a86ff, 0x50186a, 1.7));
  const sun = new THREE.DirectionalLight(0xc8d8ff, 0.9); sun.position.set(-800, 1500, -600); scene.add(sun);

  // ---- ground: dark plate with a glowing street grid ----
  const GROUND_Y = -130;
  const groundTex = canvasTex(512, 512, (c, w, h) => { c.fillStyle = '#07040f'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(255,120,40,0.55)'; c.lineWidth = 2; for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(i * 64, 0); c.lineTo(i * 64, h); c.stroke(); c.beginPath(); c.moveTo(0, i * 64); c.lineTo(w, i * 64); c.stroke(); } c.fillStyle = 'rgba(80,180,255,0.4)'; for (let i = 0; i < 600; i++) c.fillRect(rnd() * w, rnd() * h, 2, 2); });
  groundTex.repeat.set(60, 60);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), new THREE.MeshBasicMaterial({ map: groundTex })); ground.rotation.x = -Math.PI / 2; ground.position.y = GROUND_Y; scene.add(ground);

  // ---- towers ----
  const winTex = (cols, rows, hue) => canvasTex(cols * 8, rows * 8, (c, w, h) => { c.fillStyle = '#0a0a16'; c.fillRect(0, 0, w, h); for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const r = rnd(); if (r < 0.42) continue; c.fillStyle = r < 0.62 ? hue : (r < 0.8 ? '#ffe2a8' : '#dff6ff'); c.globalAlpha = 0.5 + rnd() * 0.5; c.fillRect(x * 8 + 2, y * 8 + 2, 4, 5); } c.globalAlpha = 1; });
  const kinds = [
    { geo: new THREE.BoxGeometry(1, 1, 1), tex: winTex(6, 40, '#4fd8ff'), max: 900 },
    { geo: new THREE.BoxGeometry(1, 1, 1), tex: winTex(10, 24, '#ff5fd6'), max: 900 },
    { geo: new THREE.CylinderGeometry(0.5, 0.5, 1, 8), tex: winTex(12, 36, '#ffb347'), max: 400 },
  ];
  for (const k of kinds) { k.geo.translate(0, 0.5, 0); k.mat = new THREE.MeshLambertMaterial({ map: k.tex, emissive: 0xffffff, emissiveMap: k.tex, emissiveIntensity: 0.9, color: 0x303048 }); k.mesh = new THREE.InstancedMesh(k.geo, k.mat, k.max); k.mesh.count = 0; k.mesh.frustumCulled = false; scene.add(k.mesh); }
  // corridor test against every 3rd track sample
  const samp = []; for (let i = 0; i < tr.N; i += 3) samp.push(tr.pos[i]);
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9; for (const p of samp) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const near = (x, z) => { let d = 1e9, y = 0; for (const p of samp) { const dx = p.x - x, dz = p.z - z, dd = dx * dx + dz * dz; if (dd < d) { d = dd; y = p.y; } } return [Math.sqrt(d), y]; };
  const M = new THREE.Matrix4(), col = new THREE.Color();
  const tints = [0x9aa0ff, 0xff9ad8, 0xa0fff0, 0xffd29a, 0xc0c8ff];
  for (let gx = minX - 900; gx < maxX + 900; gx += 78) for (let gz = minZ - 900; gz < maxZ + 900; gz += 78) {
    const x = gx + (rnd() - 0.5) * 50, z = gz + (rnd() - 0.5) * 50;
    const [d, ty] = near(x, z); if (d < 42) continue;
    let h = 60 + rnd() * rnd() * 380; if (rnd() < 0.04) h = 450 + rnd() * 250;
    if (d < 95) h = Math.min(h, ty - GROUND_Y - 34); else if (d < 190) h = Math.min(h, ty - GROUND_Y + 60);
    if (h < 25) continue;
    const k = kinds[rnd() < 0.15 ? 2 : (rnd() < 0.5 ? 0 : 1)]; if (k.mesh.count >= k.max) continue;
    const w = 22 + rnd() * 34, dpt = 22 + rnd() * 34;
    M.makeRotationY(rnd() < 0.5 ? 0 : Math.PI / 2); M.scale(new THREE.Vector3(w, h, dpt)); M.setPosition(x, GROUND_Y, z);
    k.mesh.setMatrixAt(k.mesh.count, M); k.mesh.setColorAt(k.mesh.count, col.setHex(tints[Math.floor(rnd() * tints.length)])); k.mesh.count++;
  }
  for (const k of kinds) { k.mesh.instanceMatrix.needsUpdate = true; if (k.mesh.instanceColor) k.mesh.instanceColor.needsUpdate = true; }

  // ---- billboards along the road ----
  const f = tr.mkFrame();
  for (let s = 180, i = 0; s < tr.length; s += 330, i++) {
    tr.frame(s, f); const side = i % 2 ? 1 : -1; const hw = tr.halfW(s);
    const text = ADS[i % ADS.length], colr = ADCOL[i % ADCOL.length];
    const tex = canvasTex(512, 256, (c, w, h) => { c.fillStyle = '#0b0416'; c.fillRect(0, 0, w, h); c.strokeStyle = colr; c.lineWidth = 10; c.strokeRect(8, 8, w - 16, h - 16); c.font = `italic 900 ${text.length > 11 ? 54 : 70}px "Arial Black", Impact, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = colr; c.shadowColor = colr; c.shadowBlur = 30; c.fillText(text, w / 2, h / 2); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(46, 23), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    m.matrixAutoUpdate = false;
    // panel faces inward across the road: basis x = -side*t? no — panel plane spans (t, n), its normal is r
    m.matrix.makeBasis(f.t.clone().multiplyScalar(-side), f.n, f.r.clone().multiplyScalar(-side)).setPosition(f.p.clone().addScaledVector(f.r, side * (hw + 36)).addScaledVector(f.n, 24));
    scene.add(m);
    const post = new THREE.Mesh(new THREE.BoxGeometry(2, 60, 2), new THREE.MeshLambertMaterial({ color: 0x40405c })); post.matrixAutoUpdate = false; post.matrix.makeBasis(f.r, f.n, f.t).setPosition(f.p.clone().addScaledVector(f.r, side * (hw + 36)).addScaledVector(f.n, -18)); scene.add(post);
  }

  // ---- traffic: distant flying cars on straight lines, looping ----
  { const n = 140, geo = new THREE.BoxGeometry(6, 1.6, 12), mat = new THREE.MeshBasicMaterial({ color: 0xffe0a0 }); const im = new THREE.InstancedMesh(geo, mat, n); im.frustumCulled = false; scene.add(im);
    const lanes = []; for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2; lanes.push({ x: minX - 600 + rnd() * (maxX - minX + 1200), z: minZ - 600 + rnd() * (maxZ - minZ + 1200), y: -60 + rnd() * 260, dx: Math.cos(a), dz: Math.sin(a), sp: 40 + rnd() * 60, t: rnd() * 4000 }); }
    world.movers.push((now) => { for (let i = 0; i < n; i++) { const l = lanes[i]; const d = ((now * 0.001 * l.sp + l.t) % 4000) - 2000; M.makeRotationY(-Math.atan2(l.dz, l.dx) + Math.PI / 2); M.setPosition(l.x + l.dx * d, l.y, l.z + l.dz * d); im.setMatrixAt(i, M); } im.instanceMatrix.needsUpdate = true; }); }

  // ---- corner-name holograms above the road ----
  for (const nm of tr.names) {
    tr.frame(nm.s, f);
    const tex = canvasTex(1024, 128, (c, w, h) => { c.clearRect(0, 0, w, h); c.font = 'italic 900 84px "Arial Black", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#7ff3ff'; c.shadowColor = '#36e0ff'; c.shadowBlur = 26; c.fillText(nm.name, w / 2, h / 2); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(90, 11), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.85 })); m.matrixAutoUpdate = false;
    m.matrix.makeBasis(f.r.clone().negate(), f.n, f.t.clone().negate()).setPosition(f.p.clone().addScaledVector(f.n, 30)); scene.add(m);
  }
  return world;
}
