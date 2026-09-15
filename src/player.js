// MUTE CITY — player handling. Momentum in track space: velocity (vs, vu) is
// carried in the road frame, the heading h is what the pilot points, and grip
// is a force pulling velocity toward heading with a ceiling (the friction
// circle). The road turning under the machine shows up as the frame rotating
// the velocity outward, so bends have to be driven.
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const sign = x => x < 0 ? -1 : 1;

export function makePlayer(m) {
  return { name: 'YOU', m, s: 0, u: 0, n: 0, vs: 0, vu: 0, v: 0, h: 0, energy: 100, lap: 1, half: false,
    boostP: 0, boosting: false, padT: 0, air: false, vn: 0, stun: 0, hitT: 0, flash: 0, spinT: 0, spinCool: 0, sideT: 0, sideDir: 0, sideCool: 0, spinOut: 0, spinOutCool: 0,
    laps: [], lapStart: 0, prog: 0, hits: 0, falls: 0, kos: 0, steer: 0, thrust: 0, drift: false, slide: 0, slip: 0, accVis: 0, rough: false, mesh: null };
}

export function resetPlayer(P) {
  Object.assign(P, { n: 0, vs: 0, vu: 0, v: 0, h: 0, energy: 100, lap: 1, half: false, boostP: 0, boosting: false, padT: 0, air: false, vn: 0, stun: 0, hitT: 0, flash: 0, spinT: 0, spinCool: 0, sideT: 0, sideDir: 0, sideCool: 0, spinOut: 0, spinOutCool: 0, laps: [], lapStart: 0, hits: 0, falls: 0, kos: 0, steer: 0, thrust: 0, slide: 0, slip: 0, rough: false });
}

// env: { tr, dsWrap, sens, canBoost, fx: { hit(impact), spark(), fall(), jump(), pad(), boostStart(), spin(), side(), mine() }, retire(), fall(P,inGap) }
export function stepPlayer(P, inp, dt, env) {
  const { tr } = env, M = P.m;
  if (P.hitT > 0) P.hitT -= dt; if (P.flash > 0) P.flash -= dt * 6; if (P.spinCool > 0) P.spinCool -= dt; if (P.sideCool > 0) P.sideCool -= dt;
  if (P.stun > 0) { P.stun -= dt; P.vs = Math.max(0, P.vs - 10 * dt); P.vu = 0; P.s = tr.wrap(P.s + P.vs * dt); P.v = P.vs; P.steer = 0; P.thrust = 0; P.boostP = 0; P.boosting = false; return; }
  const locked = P.spinT > 0 || P.spinOut > 0;
  P.steer += ((locked ? 0 : inp.steer) - P.steer) * Math.min(1, dt * 14);
  P.thrust = locked ? 0.4 : inp.thr; P.drift = inp.drift && !locked; P.slide = locked ? 0 : (inp.slideL && !inp.slideR ? -1 : inp.slideR && !inp.slideL ? 1 : 0);
  // ---- attacks ----
  if (inp.spin && P.spinCool <= 0 && P.spinT <= 0 && !P.air) { P.spinT = 0.9; P.spinCool = 2.2; env.fx.spin(); }
  if (P.spinT > 0) P.spinT -= dt;
  if (inp.sideTap && P.sideCool <= 0 && P.sideT <= 0 && !P.air && !locked) { P.sideT = 0.28; P.sideDir = inp.sideTap; P.sideCool = 1.1; P.vu += inp.sideTap * 22; env.fx.side(); }
  if (P.sideT > 0) P.sideT -= dt;
  if (P.spinOut > 0) P.spinOut -= dt; if (P.spinOutCool > 0) P.spinOutCool -= dt;
  // ---- boost (hold; drains energy) ----
  const wantBoost = inp.boost && env.canBoost() && P.energy > 0 && !P.air && P.spinOut <= 0;
  if (wantBoost && !P.boosting) env.fx.boostStart();
  P.boosting = wantBoost;
  if (P.boosting) { P.energy -= M.boostDrain * dt; if (P.energy <= 0) { P.energy = 0; env.retire('BOOSTED TO DEATH'); return; } }
  P.boostP += ((P.boosting ? 1 : 0) - P.boostP) * Math.min(1, dt * (P.boosting ? 5 : 2.2));
  if (P.padT > 0) P.padT -= dt;
  // ---- heading ----
  const k = tr.curv(P.s), sens = env.sens;
  const yawRate = 0.95 * M.yawMul * sens * (P.drift ? 1.85 : P.slide ? 1.25 : 1) * (P.air ? 0.3 : 1) * (P.boostP > 0.5 ? 0.9 : 1);
  P.h += P.steer * yawRate * dt - P.vs * k * dt;
  const speed = Math.hypot(P.vs, P.vu);
  if (Math.abs(P.steer) < 0.05 && speed > 8 && !P.drift) { const velAng = Math.atan2(-P.vu, P.vs); P.h += (velAng - P.h) * 2.6 * dt; }
  if (P.spinOut > 0) P.h += 9 * dt * (P.spinOutDir || 1);
  P.h = clamp(P.h, -0.85, 0.85);
  // ---- velocity in the frame: the frame turns, momentum does not ----
  const w = P.vs * k; const vs0 = P.vs, vu0 = P.vu;
  P.vs = vs0 + vu0 * w * dt * (-1); P.vu = vu0 + vs0 * w * dt;
  // ---- decompose along heading e and perpendicular p ----
  const es = Math.cos(P.h), eu = -Math.sin(P.h), ps = Math.sin(P.h), pu = Math.cos(P.h);
  let vA = P.vs * es + P.vu * eu, vP = P.vs * ps + P.vu * pu;
  // thrust, drag, brake, scrub
  const acc = (P.thrust * M.ACC + P.boostP * M.boostAcc) * (P.air ? 0.3 : 1);
  const top = M.TOP + P.boostP * M.boostTop + (P.padT > 0 ? 34 : 0);
  vA += acc * dt; vA -= (M.ACC / (M.TOP * M.TOP)) * vA * Math.abs(vA) * dt;
  if (!P.thrust) vA -= 5 * dt; vA -= inp.brake * 72 * dt;
  vA -= Math.abs(vP) * (P.drift ? 0.12 : 0.22) * dt;                     // sliding scrubs speed
  if (P.drift && Math.abs(P.steer) > 0.1) vA -= 6 * Math.abs(P.steer) * dt;
  if (P.rough) vA -= 55 * dt;                                            // dirt / rough zone
  if (P.spinOut > 0) vA -= 40 * dt;
  if (vA > top) vA = Math.max(top, vA - 95 * dt); if (vA < 0) vA = 0;
  // grip: pull the perpendicular component down, with a ceiling
  const gripK = M.gripK * (P.drift ? 0.6 : P.slide ? 0.35 : 1) * (P.air ? 0.04 : 1);
  const aMax = M.aMax * (P.drift ? 1.35 : P.slide ? 0.8 : 1) * (P.air ? 0.05 : 1);
  const want = Math.abs(vP) * gripK; const a = Math.min(want, aMax);
  vP -= sign(vP) * Math.min(Math.abs(vP), a * dt);
  if (P.slide && !P.air) vP += P.slide * 30 * dt;                        // strafe
  P.slip = vP;
  P.vs = vA * es + vP * ps; P.vu = vA * eu + vP * pu;
  P.v = vA; P.accVis = acc - inp.brake * 72;
  P.s = tr.wrap(P.s + P.vs * dt); P.u += P.vu * dt;
  // ---- jump gap / jump plates ----
  if (!P.air && tr.inGap(P.s)) { P.air = true; P.vn = Math.max(6, vA * 0.14); P.n = 0; env.fx.jump(); }
  if (P.air) { P.vn -= 30 * dt; P.n += P.vn * dt; if (P.n <= 0) { if (tr.inGap(P.s)) { env.fall(P, true); return; } P.air = false; P.n = 0; P.vn = 0; env.fx.land(); } }
  // ---- walls / edges ----
  const hwm = tr.halfW(P.s) - 1.9;
  if (!P.air && Math.abs(P.u) > hwm) {
    const side = sign(P.u);
    if (tr.hasRail(P.s, side)) {
      const impact = Math.max(0, P.vu * side);
      P.u = side * hwm; P.vu = -P.vu * 0.35; P.h += side * Math.min(0.3, impact * 0.012); P.hits++;
      P.energy -= (0.4 + impact * 0.15) * M.bodyMul; P.vs *= 1 - Math.min(0.3, 0.03 + impact * 0.004);
      P.flash = 1; env.fx.hit(impact, side);
      if (impact > 45 && P.spinOut <= 0 && P.spinOutCool <= 0) { P.spinOutCool = 3; P.spinOut = 0.75; P.spinOutDir = side; env.fx.spinOut(); }
      if (P.energy <= 0) { P.energy = 0; env.retire('SMASHED INTO THE RAIL'); return; }
    } else if (Math.abs(P.u) > hwm + 3.5) { env.fall(P, false); return; }
  }
  // ---- surfaces ----
  P.rough = !P.air && tr.onRough(P.s, P.u);
  if (!P.air && tr.onRecharge(P.s)) P.energy = Math.min(100, P.energy + 45 * dt);
  for (const pd of tr.pads) { if (pd.cool > 0) pd.cool -= dt; if (!P.air && pd.cool <= 0 && Math.abs(env.dsWrap(P.s - pd.s)) < 7 && Math.abs(P.u - pd.lane) < 4.6) { const kick = Math.min(M.TOP + 40, vA + 30) - vA; if (kick > 0) { P.vs += kick * es; P.vu += kick * eu; } P.padT = 2.0; pd.cool = 0.8; env.fx.pad(); } }
  for (const jp of tr.jumps) { if (jp.cool > 0) jp.cool -= dt; if (!P.air && jp.cool <= 0 && Math.abs(env.dsWrap(P.s - jp.s)) < 7 && Math.abs(P.u - jp.lane) < 4.6) { P.air = true; P.vn = 16 + vA * 0.06; P.n = 0.01; jp.cool = 1; env.fx.jump(); } }
  for (const mn of tr.mines) { if (mn.cool > 0) { mn.cool -= dt; continue; } if (!P.air && Math.abs(env.dsWrap(P.s - mn.s)) < 5 && Math.abs(P.u - mn.lane) < 4) { mn.cool = 8; P.energy -= 18 * M.bodyMul; P.vs *= 0.75; P.spinOut = 0.7; P.spinOutDir = P.u > mn.lane ? 1 : -1; P.flash = 1; env.fx.mine(mn); if (P.energy <= 0) { P.energy = 0; env.retire('HIT A MINE'); return; } } }
  if (P.s > tr.length / 2 && P.s < tr.length * 0.85) P.half = true;
  P.prog = (P.lap - 1) * tr.length + P.s;
}
