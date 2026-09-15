// MUTE CITY — the racing machine mesh. Local axes: +Z forward, +Y up, +X right.
import * as THREE from '../vendor/three.module.js';

const shared = {};
function geos() {
  if (shared.body) return shared;
  // hull: a flattened, tapered fuselage from a lathe of a profile
  const prof = []; const L = 8.4;
  for (let i = 0; i <= 10; i++) { const t = i / 10; const r = 1.55 * Math.sin(Math.PI * Math.pow(t, 0.75)) + 0.15; prof.push(new THREE.Vector2(r, (t - 0.5) * L)); }
  shared.body = new THREE.LatheGeometry(prof, 14); shared.body.scale(1.15, 0.5, 1); // squash vertically
  shared.pod = new THREE.CylinderGeometry(0.62, 0.78, 4.6, 10); shared.pod.rotateX(Math.PI / 2);
  shared.podNose = new THREE.ConeGeometry(0.62, 1.3, 10); shared.podNose.rotateX(Math.PI / 2);
  shared.canopy = new THREE.SphereGeometry(0.75, 12, 8); shared.canopy.scale(0.9, 0.55, 1.6);
  shared.fin = new THREE.BoxGeometry(0.16, 1.5, 2.2);
  shared.wing = new THREE.BoxGeometry(2.5, 0.12, 1.6);
  shared.thr = new THREE.CircleGeometry(0.5, 12);
  shared.flame = new THREE.ConeGeometry(0.55, 5, 10, 1, true); shared.flame.rotateX(-Math.PI / 2); shared.flame.translate(0, 0, -2.5);
  shared.glowMat = new THREE.MeshBasicMaterial({ color: 0x6fd0ff });
  shared.flameMat = new THREE.MeshBasicMaterial({ color: 0x3f8cff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  shared.boostMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  shared.canopyMat = new THREE.MeshStandardMaterial({ color: 0x102040, roughness: 0.15, metalness: 0.6, emissive: 0x1a3a70, emissiveIntensity: 0.6 });
  return shared;
}

export function makeMachine(colorHex, accentHex) {
  const G = geos(), g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.6, metalness: 0.15, emissive: colorHex, emissiveIntensity: 0.18 });
  const accent = new THREE.MeshStandardMaterial({ color: accentHex, roughness: 0.4, metalness: 0.3, emissive: accentHex, emissiveIntensity: 0.35 });
  const body = new THREE.Mesh(G.body, paint); g.add(body);
  const canopy = new THREE.Mesh(G.canopy, G.canopyMat); canopy.position.set(0, 0.62, 1.2); g.add(canopy);
  for (const sx of [-1, 1]) {
    const pod = new THREE.Mesh(G.pod, accent); pod.position.set(sx * 2.35, -0.15, -0.6); g.add(pod);
    const pn = new THREE.Mesh(G.podNose, paint); pn.position.set(sx * 2.35, -0.15, 2.35); g.add(pn);
    const wing = new THREE.Mesh(G.wing, paint); wing.position.set(sx * 1.4, -0.1, -0.6); g.add(wing);
    const fin = new THREE.Mesh(G.fin, accent); fin.position.set(sx * 1.1, 0.7, -3.1); fin.rotation.z = -sx * 0.45; g.add(fin);
    const thr = new THREE.Mesh(G.thr, G.glowMat); thr.position.set(sx * 2.35, -0.15, -2.95); thr.rotation.y = Math.PI; g.add(thr);
    const fl = new THREE.Mesh(G.flame, G.flameMat); fl.position.set(sx * 2.35, -0.15, -2.95); g.add(fl);
    const bf = new THREE.Mesh(G.flame, G.boostMat); bf.position.set(sx * 2.35, -0.15, -2.95); bf.scale.set(1.6, 1.6, 0.01); g.add(bf);
    (g.userData.flames ||= []).push(fl); (g.userData.boosts ||= []).push(bf);
  }
  const mainThr = new THREE.Mesh(G.thr, G.glowMat); mainThr.position.set(0, 0, -4.15); mainThr.rotation.y = Math.PI; mainThr.scale.set(1.5, 1.5, 1); g.add(mainThr);
  const mf = new THREE.Mesh(G.flame, G.flameMat); mf.position.set(0, 0, -4.15); mf.scale.set(1.5, 1.5, 1); g.add(mf); g.userData.flames.push(mf);
  const mb = new THREE.Mesh(G.flame, G.boostMat); mb.position.set(0, 0, -4.15); mb.scale.set(2.2, 2.2, 0.01); g.add(mb); g.userData.boosts.push(mb);
  g.matrixAutoUpdate = false;
  return g;
}

// set flame lengths from the throttle/speed/boost state
export function dressMachine(g, thrust, boost) {
  for (const f of g.userData.flames) f.scale.z = 0.15 + thrust * 0.8;
  for (const b of g.userData.boosts) b.scale.z = boost > 0 ? 1.2 + boost * 2.2 : 0.01;
}
