// MUTE CITY — synthesised audio: engine hum, boost, wall hit, pad chirp, countdown.
let ctx = null, engine = null, master = null;
const now = () => ctx.currentTime;

export function ensureAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
  const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 60;
  const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 61;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = 2;
  const g = ctx.createGain(); g.gain.value = 0.0;
  o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(master); o1.start(); o2.start();
  // wind noise for high speed
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const ns = ctx.createBufferSource(); ns.buffer = buf; ns.loop = true; const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 0.6; const ng = ctx.createGain(); ng.gain.value = 0; ns.connect(nf); nf.connect(ng); ng.connect(master); ns.start();
  engine = { o1, o2, lp, g, ng, nf, buf };
}

export function setEngine(v, thrust, boost) {
  if (!engine) return; const t = now();
  const f = 48 + v * 1.25 + boost * 90;
  engine.o1.frequency.setTargetAtTime(f, t, 0.05); engine.o2.frequency.setTargetAtTime(f * 1.01 + 1, t, 0.05);
  engine.lp.frequency.setTargetAtTime(250 + v * 9 + thrust * 500 + boost * 1400, t, 0.06);
  engine.g.gain.setTargetAtTime(0.10 + thrust * 0.08 + boost * 0.1, t, 0.08);
  engine.ng.gain.setTargetAtTime(Math.min(0.35, v * 0.0016) + boost * 0.15, t, 0.1);
  engine.nf.frequency.setTargetAtTime(500 + v * 8, t, 0.1);
}

function noise(dur, freq, q, vol, type = 'bandpass') {
  if (!ctx) return; const s = ctx.createBufferSource(); s.buffer = engine.buf; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = ctx.createGain(); g.gain.setValueAtTime(vol, now()); g.gain.exponentialRampToValueAtTime(0.001, now() + dur); s.connect(f); f.connect(g); g.connect(master); s.start(); s.stop(now() + dur);
}
function tone(f0, f1, dur, vol, type = 'sine') {
  if (!ctx) return; const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, now()); o.frequency.exponentialRampToValueAtTime(f1, now() + dur); const g = ctx.createGain(); g.gain.setValueAtTime(vol, now()); g.gain.exponentialRampToValueAtTime(0.001, now() + dur); o.connect(g); g.connect(master); o.start(); o.stop(now() + dur);
}
export const sfx = {
  boost() { noise(1.2, 1200, 0.8, 0.5); tone(180, 900, 0.9, 0.25, 'sawtooth'); },
  hit(p = 1) { noise(0.25, 300, 0.5, Math.min(0.9, 0.3 + p * 0.5), 'lowpass'); tone(120, 40, 0.25, 0.3, 'square'); },
  pad() { tone(500, 1400, 0.25, 0.3, 'triangle'); tone(750, 2100, 0.25, 0.15, 'sine'); },
  beep(hi = false) { tone(hi ? 1320 : 660, hi ? 1320 : 660, hi ? 0.6 : 0.18, 0.35, 'square'); },
  lap() { tone(880, 1320, 0.12, 0.25, 'triangle'); setTimeout(() => tone(1320, 1760, 0.25, 0.25, 'triangle'), 120); },
  fall() { tone(400, 60, 0.9, 0.35, 'sawtooth'); noise(0.9, 400, 0.4, 0.4, 'lowpass'); },
  explode() { noise(1.6, 200, 0.3, 1.0, 'lowpass'); tone(90, 25, 1.4, 0.5, 'square'); },
  recharge(on) { if (on) tone(440, 660, 0.15, 0.12, 'sine'); },
};
