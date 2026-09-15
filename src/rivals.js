// MUTE CITY — rivals run on rails (lane + speed), but they have energy, block,
// boost to catch up, side-attack when alongside, avoid mines and dirt, spin out
// when shoved, and die. Only the player gets the full physics.
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const sign = x => x < 0 ? -1 : 1;
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
export const DIFF = {
  novice:   { pace: 0.87, agg: 0.25, dmg: 0.6, name: 'NOVICE' },
  standard: { pace: 0.93, agg: 0.7, dmg: 0.9, name: 'STANDARD' },
  expert:   { pace: 0.99, agg: 1.0, dmg: 1.1, name: 'EXPERT' },
  master:   { pace: 1.04, agg: 1.5, dmg: 1.35, name: 'MASTER' },
};

export function makeRival(m, mesh) {
  return { name: m.pilot, machine: m.name, m, mesh, s: 0, u: 0, v: 0, lane: 0, uT: 0, h: 0, energy: 100, dead: false,
    top: m.top * (0.94 + rnd() * 0.08), agg: 0.75 + rnd() * 0.35, boostT: 0, boostCool: 0, padT: 0, lapsDone: -1, prog: 0,
    avoid: 0, avoidT: 0, touchT: 0, attackCool: 4 + rnd() * 8, spinT: 0, spinDir: 1, flash: 0, laps: [], lapStart: 0, deadT: 0 };
}
export function resetRival(rv, lane) {
  Object.assign(rv, { lane: lane * 0.9, uT: lane * 0.9, u: lane, v: 0, h: 0, energy: 100, dead: false, boostT: 0, boostCool: 3 + rnd() * 6, padT: 0, lapsDone: -1, avoidT: 0, touchT: 0, attackCool: 4 + rnd() * 8, spinT: 0, flash: 0, laps: [], lapStart: 0, deadT: 0 });
  rv.mesh.visible = true;
}

export function damageRival(rv, amount, env) {
  if (rv.dead) return false;
  rv.energy -= amount; rv.flash = 1;
  if (rv.energy <= 0) { rv.energy = 0; rv.dead = true; rv.deadT = 0; rv.v = 0; env.fx.explode(rv); return true; }
  return false;
}

// ctx: { tr, dsWrap, diff, player, raceTime, lap2 (boost allowed), fx, damagePlayer(amount, pushDir, srcRival) }
export function stepRival(rv, dt, ctx) {
  const { tr, dsWrap, diff, player: P } = ctx;
  if (rv.flash > 0) rv.flash -= dt * 6;
  if (rv.dead) { rv.deadT += dt; if (rv.deadT > 0.6) rv.mesh.visible = false; return; }
  if (rv.touchT > 0) rv.touchT -= dt; if (rv.attackCool > 0) rv.attackCool -= dt;
  // speed target from curvature ahead, pace, boost, spin
  const kA = Math.max(Math.abs(tr.curv(rv.s + rv.v * 0.5)), Math.abs(tr.curv(rv.s + 25 + rv.v * 1.0)));
  const pace = diff.pace;
  const vc = Math.min(rv.top * pace * (rv.padT > 0 ? 1.3 : 1), rv.agg * 0.95 / (kA + 1e-5) * pace);
  let target = rv.boostT > 0 ? rv.top * pace + 45 : vc;
  if (rv.spinT > 0) target = Math.min(target, 40);
  if (tr.onRough(rv.s, rv.u)) target = Math.min(target, 70);
  rv.v += clamp(target - rv.v, -55 * dt, (rv.boostT > 0 ? 70 : 40) * dt);
  // lane: apex in bends, avoid dirt and mines, block the player when just ahead
  const k = tr.curv(rv.s), hwr = tr.halfW(rv.s) - 3.2;
  let uT = rv.lane; if (Math.abs(k) > 0.002) uT = -sign(k) * hwr * 0.5 * Math.min(1, Math.abs(k) * 250) + rv.lane * 0.3;
  const dsP = dsWrap(rv.s - P.s);
  if (dsP > 4 && dsP < 40 && rv.agg * diff.agg > 0.6 && P.v > rv.v - 5 && rv.spinT <= 0) uT = uT * 0.4 + P.u * 0.6;   // blocker
  for (const mn of tr.mines) { const d = dsWrap(mn.s - rv.s); if (d > 0 && d < 70 && Math.abs(uT - mn.lane) < 6) uT = mn.lane + (uT >= mn.lane ? 7 : -7); }
  if (tr.roughAhead(rv.s, uT)) uT = tr.roughEscape(rv.s, uT);
  if (rv.avoidT > 0) { rv.avoidT -= dt; uT += rv.avoid * 7; }
  if (rv.spinT > 0) { rv.spinT -= dt; rv.h += 8 * dt * rv.spinDir; uT = rv.u + rv.spinDir * 4; } else rv.h *= Math.max(0, 1 - 6 * dt);
  uT = clamp(uT, -hwr, hwr); rv.uT = uT;
  rv.u += clamp(uT - rv.u, -7 * dt, 7 * dt);
  // shoved past the edge → rail damage / fall
  if (Math.abs(rv.u) > hwr + 1.5) { const side = sign(rv.u); if (tr.hasRail(rv.s, side)) { rv.u = side * (hwr + 1.5); rv.v *= 0.85; if (damageRival(rv, 12 * diff.dmg, ctx)) { if (ctx.lastShover === rv) {} } ctx.fx.spark(rv, side); } else { rv.u = 0; rv.v = 30; damageRival(rv, 25, ctx); ctx.fx.rivalFall(rv); } }
  const prev = rv.s; rv.s = tr.wrap(rv.s + rv.v * dt);
  if (rv.s < prev - tr.length / 2) { rv.lapsDone++; if (rv.lapsDone >= 1) rv.laps.push(ctx.raceTime - rv.lapStart); rv.lapStart = ctx.raceTime; }
  // boost: on straights from lap 2, more often when behind the player
  if (rv.boostT > 0) { rv.boostT -= dt; rv.energy = Math.max(1, rv.energy - 12 * dt); }
  else if (rv.boostCool > 0) rv.boostCool -= dt;
  else if (ctx.lap2 && kA < 0.0015 && rv.energy > 30 && rnd() < (dsP < 0 && dsP > -300 ? 1.2 : 0.5) * dt) { rv.boostT = 1.0; rv.boostCool = 5 + rnd() * 9; }
  if (rv.padT > 0) rv.padT -= dt;
  for (const pd of tr.pads) if (Math.abs(dsWrap(rv.s - pd.s)) < 7 && Math.abs(rv.u - pd.lane) < 4.6 && rv.padT <= 0.5) { rv.v += 22; rv.padT = 1.6; }
  if (tr.onRecharge(rv.s)) rv.energy = Math.min(100, rv.energy + 30 * dt);
  // attack the player when alongside
  const du = P.u - rv.u;
  if (rv.attackCool <= 0 && Math.abs(dsP) < 7 && Math.abs(du) > 4 && Math.abs(du) < 10 && rv.agg * diff.agg > 0.5 && !P.air && P.stun <= 0 && rv.spinT <= 0) {
    rv.attackCool = (7 + rnd() * 8) / diff.agg; rv.avoid = sign(du); rv.avoidT = 0.35;
    ctx.damagePlayer(8 * diff.dmg, sign(du), rv);
  }
  rv.prog = rv.lapsDone * tr.length + rv.s;
}

// rival vs rival: the one behind yields; occasional shoves cost energy (KOs happen)
export function rivalContacts(rivals, dt, ctx) {
  for (let i = 0; i < rivals.length; i++) {
    const a = rivals[i]; if (a.dead) continue;
    for (let j = i + 1; j < rivals.length; j++) {
      const b = rivals[j]; if (b.dead) continue;
      const ds = ctx.dsWrap(b.s - a.s); if (Math.abs(ds) > 10 || Math.abs(b.u - a.u) > 4.5) continue;
      const back = ds > 0 ? a : b, front = ds > 0 ? b : a;
      back.v = Math.min(back.v, front.v - 1);
      if (back.avoidT <= 0) { back.avoid = back.u > front.u ? 1 : -1; back.avoidT = 1.2; }
      if (Math.abs(ds) < 4 && a.touchT <= 0 && b.touchT <= 0 && rnd() < 0.25) { a.touchT = b.touchT = 1.5; const loser = a.agg > b.agg ? b : a; if (damageRival(loser, (6 + rnd() * 10) * ctx.diff.dmg, ctx)) ctx.fx.koToast(loser, null); else ctx.fx.spark(loser, sign(loser.u - (loser === a ? b : a).u)); }
    }
  }
}
