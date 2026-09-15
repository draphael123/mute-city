// MUTE CITY — settings (persisted) + pause menu. Keyboard, mouse and gamepad.
const KEY = 'mc-settings';
const DEF = { music: 60, sfx: 80, steer: 100, camera: 'near', shake: true, quality: 'high', unit: 'km/h', minimap: true, intro: true, announcer: true };
const ROWS = [
  { k: 'music', label: 'MUSIC VOLUME', min: 0, max: 100, step: 10, fmt: v => v + '%' },
  { k: 'sfx', label: 'SFX VOLUME', min: 0, max: 100, step: 10, fmt: v => v + '%' },
  { k: 'steer', label: 'STEER SENSITIVITY', min: 60, max: 140, step: 10, fmt: v => v + '%' },
  { k: 'camera', label: 'CAMERA', opts: ['near', 'far'], fmt: v => v.toUpperCase() },
  { k: 'shake', label: 'CAMERA SHAKE', opts: [true, false], fmt: v => v ? 'ON' : 'OFF' },
  { k: 'quality', label: 'RENDER QUALITY', opts: ['low', 'medium', 'high'], fmt: v => v.toUpperCase() },
  { k: 'unit', label: 'SPEED UNIT', opts: ['km/h', 'mph'], fmt: v => v },
  { k: 'minimap', label: 'MINIMAP', opts: [true, false], fmt: v => v ? 'ON' : 'OFF' },
  { k: 'intro', label: 'OPENING FLYOVER', opts: [true, false], fmt: v => v ? 'ON' : 'OFF' },
  { k: 'announcer', label: 'ANNOUNCER', opts: [true, false], fmt: v => v ? 'ON' : 'OFF' },
];
function load() { try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEF }; } }
export const settings = {
  data: load(), listeners: [],
  set(k, v) { this.data[k] = v; try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch {} for (const f of this.listeners) f(k, v); },
  onChange(f) { this.listeners.push(f); },
};

let open = null;         // 'settings' | 'pause' | null
let sel = 0, onClose = null, pauseActions = null, returnTo = null;
const $ = id => document.getElementById(id);
const PAUSE_ITEMS = [['RESUME', 'resume'], ['RESTART RACE', 'restart'], ['SETTINGS', 'settings'], ['QUIT TO TITLE', 'quit']];

function renderSettings() {
  const box = $('settingsList'); box.innerHTML = '';
  ROWS.forEach((r, i) => {
    const row = document.createElement('div'); row.className = 'row' + (i === sel ? ' sel' : '');
    row.innerHTML = `<span class="lbl">${r.label}</span><span class="val"><b class="arr" data-d="-1">◀</b><span class="v">${r.fmt(settings.data[r.k])}</span><b class="arr" data-d="1">▶</b></span>`;
    row.addEventListener('mousemove', () => { if (sel !== i) { sel = i; renderSettings(); } });
    row.querySelectorAll('.arr').forEach(a => a.addEventListener('click', e => { e.stopPropagation(); sel = i; adjust(+a.dataset.d); }));
    row.addEventListener('click', () => { sel = i; adjust(1); });
    box.appendChild(row);
  });
}
function adjust(d) {
  const r = ROWS[sel]; let v = settings.data[r.k];
  if (r.opts) { const i = r.opts.indexOf(v); v = r.opts[(i + d + r.opts.length) % r.opts.length]; }
  else v = Math.max(r.min, Math.min(r.max, v + d * r.step));
  settings.set(r.k, v); renderSettings();
}
function renderPause() {
  const box = $('pauseList'); box.innerHTML = '';
  PAUSE_ITEMS.forEach(([label, act], i) => {
    const it = document.createElement('div'); it.className = 'item' + (i === sel ? ' sel' : ''); it.textContent = label;
    it.addEventListener('mousemove', () => { if (sel !== i) { sel = i; renderPause(); } });
    it.addEventListener('click', () => { sel = i; pauseConfirm(); });
    box.appendChild(it);
  });
}
function pauseConfirm() {
  const act = PAUSE_ITEMS[sel][1];
  if (act === 'settings') { returnTo = 'pause'; openSettings(); return; }
  closeAll(); pauseActions && pauseActions[act] && pauseActions[act]();
}
export function openSettings(cb) {
  if (cb) onClose = cb;
  if (open !== 'pause') returnTo = returnTo || null;
  open = 'settings'; sel = 0; $('pause').hidden = true; $('settings').hidden = false; renderSettings();
}
export function openPause(actions) { pauseActions = actions; open = 'pause'; sel = 0; returnTo = null; $('pause').hidden = false; $('settings').hidden = true; renderPause(); }
export function closeAll() { open = null; $('pause').hidden = true; $('settings').hidden = true; const cb = onClose; onClose = null; returnTo = null; cb && cb(); }
export const isOpen = () => open !== null;
function back() {
  if (open === 'settings' && returnTo === 'pause') { returnTo = null; open = 'pause'; sel = 0; $('settings').hidden = true; $('pause').hidden = false; renderPause(); return; }
  if (open === 'pause') { closeAll(); pauseActions && pauseActions.resume && pauseActions.resume(); return; }
  closeAll();
}
// keyboard (capture so the game never sees keys while a menu is open)
addEventListener('keydown', e => {
  if (!open) return;
  e.stopImmediatePropagation(); e.preventDefault();
  const n = open === 'settings' ? ROWS.length : PAUSE_ITEMS.length;
  const c = e.code;
  if (c === 'ArrowUp' || c === 'KeyW') { sel = (sel - 1 + n) % n; }
  else if (c === 'ArrowDown' || c === 'KeyS') { sel = (sel + 1) % n; }
  else if (open === 'settings' && (c === 'ArrowLeft' || c === 'KeyA')) { adjust(-1); return; }
  else if (open === 'settings' && (c === 'ArrowRight' || c === 'KeyD' || c === 'Enter' || c === 'Space')) { adjust(1); return; }
  else if (open === 'pause' && (c === 'Enter' || c === 'Space')) { pauseConfirm(); return; }
  else if (c === 'Escape' || c === 'Backspace' || c === 'KeyP') { back(); return; }
  open === 'settings' ? renderSettings() : renderPause();
}, true);
$('settingsBack').addEventListener('click', back);
// gamepad: call every frame with the pad (or null); handles edge detection itself
let prevBtn = [];
export function pollGamepad(gp) {
  if (!gp) { prevBtn = []; return null; }
  const pressed = i => !!(gp.buttons[i] && gp.buttons[i].pressed), was = i => !!prevBtn[i];
  const edge = i => pressed(i) && !was(i);
  const ax = gp.axes[1] || 0, ax0 = gp.axes[0] || 0;
  const up = edge(12) || (ax < -0.6 && !(prevBtn.ay < -0.6)), down = edge(13) || (ax > 0.6 && !(prevBtn.ay > 0.6));
  const left = edge(14) || (ax0 < -0.6 && !(prevBtn.ax < -0.6)), right = edge(15) || (ax0 > 0.6 && !(prevBtn.ax > 0.6));
  const a = edge(0), b = edge(1), start = edge(9);
  const out = { start };
  if (open) {
    const n = open === 'settings' ? ROWS.length : PAUSE_ITEMS.length;
    if (up) sel = (sel - 1 + n) % n; if (down) sel = (sel + 1) % n;
    if (open === 'settings') { if (left) adjust(-1); if (right || a) adjust(1); if (b) back(); if (up || down) renderSettings(); }
    else { if (a) pauseConfirm(); else if (b || start) back(); else if (up || down) renderPause(); }
    out.start = false;
  }
  prevBtn = gp.buttons.map(x => x.pressed); prevBtn.ay = ax; prevBtn.ax = ax0;
  return out;
}
