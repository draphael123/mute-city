// MUTE CITY — soundtrack. HTMLAudio elements (streamed, looped) with a short
// crossfade. Tracks are CC0 from OpenGameArt — see audio/CREDITS.txt.
export const TRACKS = {
  menu: [{ src: 'audio/menu-vintage.mp3', title: 'Vintage Menu', by: 'iamoneabe' }],
  race: [
    { src: 'audio/race-midnight-drive.mp3', title: 'Midnight Drive', by: 'congusbongus' },
    { src: 'audio/race-space-city.mp3', title: 'Space City', by: 'MintoDog' },
  ],
};
let vol = 0.6, duck = 1, cur = null, curKey = null, raceIdx = 0, fader = null, unlocked = false;
const els = new Map();
const el = t => { if (!els.has(t.src)) { const a = new Audio(t.src); a.loop = true; a.preload = 'auto'; a.volume = 0; els.set(t.src, a); } return els.get(t.src); };
function crossfade(next) {
  const prev = cur; cur = next; if (fader) clearInterval(fader);
  next.volume = 0; next.play().catch(() => {});
  const t0 = performance.now(), D = 900;
  fader = setInterval(() => {
    const f = Math.min(1, (performance.now() - t0) / D);
    next.volume = vol * duck * f; if (prev && prev !== next) prev.volume = vol * duck * (1 - f);
    if (f >= 1) { clearInterval(fader); fader = null; if (prev && prev !== next) { prev.pause(); prev.currentTime = 0; } }
  }, 40);
}
export const music = {
  now: null,
  unlock() { unlocked = true; },
  setVolume(v) { vol = v; if (cur && !fader) cur.volume = vol * duck; },
  setDuck(d) { duck = d; if (cur && !fader) cur.volume = vol * duck; },
  play(key) {
    if (!unlocked) return;
    if (key === curKey && cur && !cur.paused) return;
    const t = key === 'race' ? TRACKS.race[raceIdx++ % TRACKS.race.length] : TRACKS.menu[0];
    this.now = t; curKey = key; crossfade(el(t));
  },
  pause() { if (cur) cur.pause(); },
  resume() { if (cur && unlocked) cur.play().catch(() => {}); },
  stop() { if (fader) clearInterval(fader); fader = null; if (cur) { cur.pause(); cur.currentTime = 0; } cur = null; curKey = null; },
};
