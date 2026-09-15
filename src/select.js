// MUTE CITY — mode select + machine select screens (DOM), and ghost storage.
import { ROSTER } from './machines.js';
import { DIFF } from './rivals.js';
const $ = id => document.getElementById(id);
const DIFFS = Object.keys(DIFF);

// ---------- mode select ----------
const MODES = [['GRAND PRIX', 'gp'], ['TIME ATTACK', 'ta'], ['SETTINGS', 'settings']];
let modeSel = 0, modeOpen = false, modeCb = null;
export const prefs = { diff: 'standard', machine: 0, balance: 0 };
try { Object.assign(prefs, JSON.parse(localStorage.getItem('mc-prefs') || '{}')); } catch {}
const savePrefs = () => { try { localStorage.setItem('mc-prefs', JSON.stringify(prefs)); } catch {} };

function renderModes() {
  const box = $('modeList'); box.innerHTML = '';
  MODES.forEach(([label, id], i) => {
    const it = document.createElement('div'); it.className = 'item' + (i === modeSel ? ' sel' : '');
    it.innerHTML = id === 'gp' ? `${label} <span class="sub2">◀ ${DIFF[prefs.diff].name} ▶</span>` : id === 'ta' ? `${label} <span class="sub2">${bestLine()}</span>` : label;
    it.addEventListener('mousemove', () => { if (modeSel !== i) { modeSel = i; renderModes(); } });
    it.addEventListener('click', () => { modeSel = i; modeConfirm(); });
    box.appendChild(it);
  });
}
const fmt = t => `${Math.floor(t / 60)}'${(t % 60).toFixed(2).padStart(5, '0')}`;
function bestLine() { const g = loadGhost(); return g ? `best ${fmt(g.total)} · ${g.machine}` : 'no record yet'; }
function modeConfirm() { const id = MODES[modeSel][1]; modeOpen = false; $('modes').hidden = true; modeCb && modeCb(id); }
export function openModes(cb) { modeCb = cb; modeOpen = true; $('modes').hidden = false; renderModes(); }
export function closeModes() { modeOpen = false; $('modes').hidden = true; }
export const modesOpen = () => modeOpen;

// ---------- machine select ----------
let selOpen = false, selCb = null, selIdx = 0;
const GRADE_COL = { A: '#7cff5a', B: '#bfff5a', C: '#ffe66a', D: '#ffb347', E: '#ff5a7a' };
function renderSelect() {
  const m = ROSTER[selIdx];
  $('selName').textContent = m.name; $('selPilot').textContent = m.pilot; $('selIdx').textContent = `${selIdx + 1} / ${ROSTER.length}`;
  $('selGrades').innerHTML = [['BODY', m.body], ['BOOST', m.boost], ['GRIP', m.grip]].map(([l, g]) => `<div class="grade"><span>${l}</span><b style="color:${GRADE_COL[g]}">${g}</b></div>`).join('') + `<div class="grade"><span>WEIGHT</span><b>${m.weight} kg</b></div>`;
  const b = prefs.balance; const pct = Math.round((b + 1) * 50);
  $('selBal').innerHTML = `<div class="balLbl"><span>ACCEL</span><span>MAX SPEED</span></div><div class="balBar"><div class="balKnob" style="left:${pct}%"></div></div><div class="balVal">top ${Math.round((m.top * (1 + 0.06 * b)) * 3.6 * 2.4)} km/h · accel ${(m.acc * (1 - 0.25 * b)).toFixed(0)}</div>`;
  $('selSwatch').style.background = '#' + m.color.toString(16).padStart(6, '0'); $('selSwatch').style.boxShadow = `0 0 30px #${m.color.toString(16).padStart(6, '0')}`;
  selCb && selCb('preview', selIdx);
}
export function openSelect(cb) { selCb = cb; selOpen = true; selIdx = prefs.machine || 0; $('select').hidden = false; renderSelect(); }
export function closeSelect() { selOpen = false; $('select').hidden = true; }
export const selectOpen = () => selOpen;
function selectMove(d) { selIdx = (selIdx + d + ROSTER.length) % ROSTER.length; renderSelect(); }
function selectBal(d) { prefs.balance = Math.max(-1, Math.min(1, +(prefs.balance + d * 0.25).toFixed(2))); renderSelect(); }
function selectConfirm() { prefs.machine = selIdx; savePrefs(); selOpen = false; $('select').hidden = true; selCb && selCb('confirm', selIdx, prefs.balance); }
function selectBack() { selOpen = false; $('select').hidden = true; selCb && selCb('back'); }
$('selPrev').addEventListener('click', () => selectMove(-1)); $('selNext').addEventListener('click', () => selectMove(1));
$('selGo').addEventListener('click', selectConfirm); $('selBack').addEventListener('click', selectBack);
$('selBal').addEventListener('click', e => { const r = $('selBal').querySelector('.balBar').getBoundingClientRect(); const f = (e.clientX - r.left) / r.width; if (f >= 0 && f <= 1) { prefs.balance = +(Math.round((f * 2 - 1) * 4) / 4).toFixed(2); renderSelect(); } });

// ---------- shared key / pad handling (captured before the game sees it) ----------
addEventListener('keydown', e => {
  if (modeOpen) {
    e.stopImmediatePropagation(); e.preventDefault(); const c = e.code;
    if (c === 'ArrowUp' || c === 'KeyW') modeSel = (modeSel + MODES.length - 1) % MODES.length;
    else if (c === 'ArrowDown' || c === 'KeyS') modeSel = (modeSel + 1) % MODES.length;
    else if ((c === 'ArrowLeft' || c === 'KeyA' || c === 'ArrowRight' || c === 'KeyD') && MODES[modeSel][1] === 'gp') { const d = (c === 'ArrowLeft' || c === 'KeyA') ? -1 : 1; prefs.diff = DIFFS[(DIFFS.indexOf(prefs.diff) + d + DIFFS.length) % DIFFS.length]; savePrefs(); }
    else if (c === 'Enter' || c === 'Space') { modeConfirm(); return; }
    else if (c === 'Escape') { closeModes(); modeCb && modeCb('back'); return; }
    renderModes(); return;
  }
  if (selOpen) {
    e.stopImmediatePropagation(); e.preventDefault(); const c = e.code;
    if (c === 'ArrowLeft' || c === 'KeyA') selectMove(-1); else if (c === 'ArrowRight' || c === 'KeyD') selectMove(1);
    else if (c === 'ArrowUp' || c === 'KeyW') selectBal(1); else if (c === 'ArrowDown' || c === 'KeyS') selectBal(-1);
    else if (c === 'Enter' || c === 'Space') selectConfirm(); else if (c === 'Escape') selectBack();
  }
}, true);
let prev = [];
export function pollPad(gp) {
  if (!gp || (!modeOpen && !selOpen)) { prev = []; return false; }
  const pr = i => !!(gp.buttons[i] && gp.buttons[i].pressed), edge = i => pr(i) && !prev[i];
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  const left = edge(14) || (ax < -0.6 && !(prev.ax < -0.6)), right = edge(15) || (ax > 0.6 && !(prev.ax > 0.6)), up = edge(12) || (ay < -0.6 && !(prev.ay < -0.6)), down = edge(13) || (ay > 0.6 && !(prev.ay > 0.6));
  if (modeOpen) { if (up) modeSel = (modeSel + 2) % 3; if (down) modeSel = (modeSel + 1) % 3; if ((left || right) && MODES[modeSel][1] === 'gp') { prefs.diff = DIFFS[(DIFFS.indexOf(prefs.diff) + (left ? -1 : 1) + DIFFS.length) % DIFFS.length]; savePrefs(); } if (edge(0) || edge(9)) modeConfirm(); else renderModes(); }
  else if (selOpen) { if (left) selectMove(-1); if (right) selectMove(1); if (up) selectBal(1); if (down) selectBal(-1); if (edge(0) || edge(9)) selectConfirm(); if (edge(1)) selectBack(); }
  prev = gp.buttons.map(b => b.pressed); prev.ax = ax; prev.ay = ay; return true;
}

// ---------- ghost (time attack record) ----------
export function loadGhost() { try { const g = JSON.parse(localStorage.getItem('mc-ghost') || 'null'); return g && g.frames ? g : null; } catch { return null; } }
export function saveGhost(g) { try { localStorage.setItem('mc-ghost', JSON.stringify(g)); return true; } catch { return false; } }
