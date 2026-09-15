// MUTE CITY — particles (sparks, explosions), speed lines overlay.
import * as THREE from '../vendor/three.module.js';

const MAX = 900;
export function makeFX(scene, tr) {
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3), vel = new Float32Array(MAX * 3), life = new Float32Array(MAX), lifeMax = new Float32Array(MAX);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 1.4, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false; scene.add(points);
  let head = 0; const F = tr.mkFrame(), tmp = new THREE.Vector3(), g = new THREE.Vector3();
  function emit(s, u, n, count, spread, speedMin, speedMax, color, lifeS, dirS = 0, dirU = 0) {
    tr.frame(s, F);
    for (let i = 0; i < count; i++) {
      const k = head; head = (head + 1) % MAX;
      tmp.copy(F.p).addScaledVector(F.r, u).addScaledVector(F.n, n + 1);
      pos[k * 3] = tmp.x; pos[k * 3 + 1] = tmp.y; pos[k * 3 + 2] = tmp.z;
      const sp = speedMin + Math.random() * (speedMax - speedMin);
      const ds = dirS + (Math.random() - 0.5) * spread, du = dirU + (Math.random() - 0.5) * spread, dn = 0.3 + Math.random() * spread;
      const L = Math.hypot(ds, du, dn) || 1;
      vel[k * 3] = (F.t.x * ds + F.r.x * du + F.n.x * dn) / L * sp; vel[k * 3 + 1] = (F.t.y * ds + F.r.y * du + F.n.y * dn) / L * sp; vel[k * 3 + 2] = (F.t.z * ds + F.r.z * du + F.n.z * dn) / L * sp;
      g.copy(F.n);
      const c = color[Math.floor(Math.random() * color.length)];
      col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
      life[k] = lifeMax[k] = lifeS * (0.6 + Math.random() * 0.6);
    }
  }
  const SPARK = [[1, 0.8, 0.3], [1, 1, 0.8], [0.6, 0.9, 1]], FIRE = [[1, 0.5, 0.1], [1, 0.9, 0.2], [1, 0.2, 0.1], [0.9, 0.9, 0.9]];
  return {
    points,
    spark(s, u, side, strength = 1) { emit(s, u * side > 0 ? u : u, 0, Math.min(40, 8 + strength * 12), 1.2, 6, 20 + strength * 15, SPARK, 0.35, 1, -side * 0.6); },
    explode(s, u, n = 0) { emit(s, u, n, 220, 2.4, 8, 42, FIRE, 1.1); emit(s, u, n, 60, 1, 2, 10, [[1, 1, 1]], 0.5); },
    burst(s, u, colorArr, count = 40) { emit(s, u, 0, count, 2, 5, 25, colorArr, 0.5); },
    update(dt) {
      const up = new THREE.Vector3(0, 1, 0);
      for (let k = 0; k < MAX; k++) {
        if (life[k] <= 0) { pos[k * 3 + 1] = -9999; continue; }
        life[k] -= dt; const f = life[k] / lifeMax[k];
        vel[k * 3 + 1] -= 14 * dt; // world gravity for particles (cheap)
        pos[k * 3] += vel[k * 3] * dt; pos[k * 3 + 1] += vel[k * 3 + 1] * dt; pos[k * 3 + 2] += vel[k * 3 + 2] * dt;
        vel[k * 3] *= 1 - 1.5 * dt; vel[k * 3 + 2] *= 1 - 1.5 * dt;
        col[k * 3] *= 1 - 0.4 * dt; col[k * 3 + 1] *= 1 - 1.2 * dt; col[k * 3 + 2] *= 1 - 1.8 * dt;
        if (f < 0.25) { col[k * 3] *= 0.92; col[k * 3 + 1] *= 0.9; col[k * 3 + 2] *= 0.9; }
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    },
  };
}

// 2D speed-lines overlay: radial streaks whose density follows speed / boost
export function makeSpeedLines(canvas) {
  const c = canvas.getContext('2d'); let streaks = [];
  for (let i = 0; i < 70; i++) streaks.push({ a: Math.random() * Math.PI * 2, r: 0.25 + Math.random() * 0.75, len: 0.1 + Math.random() * 0.25, w: 0.5 + Math.random() * 1.5, ph: Math.random() });
  return function draw(intensity, boost) {
    const W = canvas.width = canvas.clientWidth || 1, H = canvas.height = canvas.clientHeight || 1;
    c.clearRect(0, 0, W, H); if (intensity <= 0.02) return;
    const cx = W / 2, cy = H * 0.46, R = Math.hypot(W, H) / 2;
    c.lineCap = 'round';
    for (const s of streaks) {
      s.ph = (s.ph + 0.03 + intensity * 0.06) % 1; if (s.ph < 1 - Math.min(0.95, intensity * 1.4)) continue;
      const r0 = (s.r + s.ph * 0.4) * R, r1 = r0 + s.len * R * (0.4 + intensity + boost);
      c.strokeStyle = boost > 0.3 ? `rgba(255,200,120,${0.25 * intensity})` : `rgba(180,230,255,${0.22 * intensity})`; c.lineWidth = s.w;
      c.beginPath(); c.moveTo(cx + Math.cos(s.a) * r0, cy + Math.sin(s.a) * r0); c.lineTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1); c.stroke();
    }
  };
}
