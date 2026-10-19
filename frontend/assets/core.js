'use strict';
/* ШКОЛА+ · ядро: безопасные шаблоны, API, роутер, оболочка */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// html`` экранирует всё, что подставляется; raw() помечает уже безопасную разметку
const RAW = Symbol('raw');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const part = v => v == null || v === false ? '' : Array.isArray(v) ? v.map(part).join('') : (v && v[RAW] !== undefined) ? v[RAW] : esc(v);
const html = (s, ...v) => ({ [RAW]: s.reduce((a, x, i) => a + x + (i < v.length ? part(v[i]) : ''), '') });
const raw = s => ({ [RAW]: String(s) });
const str = h => part(h);

const ROLE = { teacher: 'Учитель', worker: 'Работник', admin: 'Администратор', director: 'Директор' };
const STATUS = { new: 'Новая', accepted: 'Принята', working: 'В работе', done: 'Готово', rejected: 'Отклонена', rework: 'На доработке' };
const PRIO = { low: 'Низкий', medium: 'Средний', high: 'Высокий', critical: 'Критический' };
const PRIO_HINT = { low: 'до 72 ч', medium: 'до 24 ч', high: 'до 8 ч', critical: 'до 2 ч' };
const CAT = { electricity: 'Электрика', furniture: 'Мебель', tech: 'Техника', heating: 'Отопление', plumbing: 'Сантехника', lighting: 'Освещение', windows_doors: 'Двери и окна', cleaning: 'Уборка', other: 'Другое' };
const ACTION = { confirmed: 'Результат подтверждён', reopened: 'Возвращена на доработку', ai_clarified: 'Уточнение для диагностики',  created: 'Заявка создана', accepted: 'Принята', working: 'Работа начата', done: 'Работа завершена', rejected: 'Отклонена', rework: 'На доработке', cancelled: 'Отменена автором', assigned: 'Назначен исполнитель' };
const isActive = r => r.status !== 'done' && r.status !== 'rejected';

const S = { token: sessionStorage.getItem('sp_token'), user: JSON.parse(sessionStorage.getItem('sp_user') || 'null'), pending: null };
function setSession(token, user) {
  S.token = token; S.user = user;
  if (token) { sessionStorage.setItem('sp_token', token); sessionStorage.setItem('sp_user', JSON.stringify(user)); }
  else { sessionStorage.removeItem('sp_token'); sessionStorage.removeItem('sp_user'); }
}
function signOut(expired) { clearImageCache(); setSession(null, null); location.hash = '#/login'; if (!expired) toast('Вы вышли из аккаунта'); }

/* ---------- тема ---------- */
function applyTheme() {
  const t = localStorage.getItem('sp_theme') || 'auto';
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  document.body.classList.toggle('compact', localStorage.getItem('sp_density') === 'compact');
}

/* ---------- сеть ---------- */
async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {}; let data;
  if (S.token) headers.Authorization = 'Bearer ' + S.token;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; data = JSON.stringify(body); } else if (form) data = form;
  let r;
  try { r = await fetch(path, { method, headers, body: data }); } catch { throw new Error('Нет связи с сервером'); }
  if (r.status === 401 && S.token) { signOut(true); throw new Error('Сессия истекла. Войдите снова'); }
  if (!r.ok) {
    let d = {}; try { d = await r.json(); } catch { /* пустое тело */ }
    throw new Error(typeof d.detail === 'string' ? d.detail : Array.isArray(d.detail) ? 'Проверьте заполнение полей' : `Ошибка запроса (${r.status})`);
  }
  return (r.headers.get('content-type') || '').includes('json') ? r.json() : r;
}
function sendForm(path, form, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest(); x.open('POST', path);
    if (S.token) x.setRequestHeader('Authorization', 'Bearer ' + S.token);
    x.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100)); };
    x.onload = () => {
      let d = {}; try { d = JSON.parse(x.responseText); } catch { /* пусто */ }
      if (x.status >= 200 && x.status < 300) resolve(d);
      else reject(new Error(typeof d.detail === 'string' ? d.detail : 'Ошибка загрузки'));
    };
    x.onerror = () => reject(new Error('Не удалось отправить файл'));
    x.send(form);
  });
}
// Фото защищены авторизацией, поэтому <img> получает blob, а не прямую ссылку
const imgCache = new Map();
function clearImageCache() { for (const pending of imgCache.values()) pending.then(url => URL.revokeObjectURL(url)).catch(() => {}); imgCache.clear(); }
const blobUrl = path => {
  if (!imgCache.has(path)) imgCache.set(path, api(path).then(r => r.blob()).then(b => URL.createObjectURL(b)).catch(e => { imgCache.delete(path); throw e; }));
  return imgCache.get(path);
};
function hydrateImages(root = document) {
  $$('img[data-src]', root).forEach(img => blobUrl(img.dataset.src).then(u => { img.src = u; }).catch(() => {
    const s = document.createElement('div'); s.className = 'img-fail'; s.textContent = 'Фото недоступно'; img.replaceWith(s);
  }));
}
async function download(path, name) {
  const b = await (await api(path)).blob(); const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- время ---------- */
const pad = n => String(n).padStart(2, '0');
function fmtDate(d) { const x = d ? new Date(d) : null; return !x || isNaN(x) ? '—' : `${pad(x.getDate())}.${pad(x.getMonth() + 1)} ${pad(x.getHours())}:${pad(x.getMinutes())}`; }
function dur(ms) { const m = Math.round(Math.abs(ms) / 60000); if (m < 60) return m + ' мин'; const h = Math.floor(m / 60); return h < 48 ? `${h} ч ${pad(m % 60)} м` : `${Math.floor(h / 24)} д ${h % 24} ч`; }
function ago(d) { const ms = Date.now() - new Date(d); return ms < 60000 ? 'только что' : dur(ms) + ' назад'; }
const fmtMin = m => m == null || !m ? '—' : m < 60 ? Math.round(m) + ' мин' : `${Math.floor(m / 60)} ч ${Math.round(m % 60)} м`;
function slaInfo(r) {
  if (!isActive(r) || !r.sla_due_at) return null;
  const left = new Date(r.sla_due_at) - Date.now(), total = (r.sla_hours || 24) * 3600000;
  return { left, total, over: left < 0, warn: left >= 0 && left < total * .25 };
}
const slaText = i => i.over ? 'просрочено ' + dur(i.left) : 'ещё ' + dur(i.left);
const slaCls = i => i.over ? 'over' : i.warn ? 'warn' : '';
const slaBadge = r => { const i = slaInfo(r); return i ? html`<span class="sla ${slaCls(i)}" data-due="${r.sla_due_at}" data-hours="${r.sla_hours}">${slaText(i)}</span>` : ''; };
function tickSla() {
  $$('[data-due]').forEach(el => {
    const left = new Date(el.dataset.due) - Date.now(), total = el.dataset.hours * 3600000;
    const i = { left, total, over: left < 0, warn: left >= 0 && left < total * .25 };
    el.textContent = slaText(i); el.className = 'sla ' + slaCls(i);
  });
}

/* ---------- мелкие компоненты ---------- */
const ICONS = {
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>', list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', map: '<path d="M4 6l6-3 4 3 6-3v15l-6 3-4-3-6 3z"/><path d="M10 3v15M14 6v15"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>', shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z"/><path d="M10 21h4"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  moon: '<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z"/>', out: '<path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', cam: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h-3zM20 14v6h-3"/>', dl: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>', check: '<path d="m5 12 5 5 9-10"/>'
};
const ic = n => raw(`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`);
const plate = (n, cls = '') => html`<span class="plate ${cls}">${n}</span>`;
const statusPill = s => html`<span class="pill st-${s}">${STATUS[s] || s}</span>`;
const prioTag = p => html`<span class="prio p-${p || 'medium'}"><i></i>${PRIO[p] || 'Средний'}</span>`;
const empty = (title, text, action) => html`<div class="empty"><b>${title}</b><p>${text}</p>${action}</div>`;
const skeleton = (n = 4) => html`<div class="skel">${Array.from({ length: n }, () => raw('<i></i>'))}</div>`;
const initials = n => String(n || '?').split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const aiList = v => { try { return Array.isArray(v) ? v : v ? JSON.parse(v) : []; } catch { return []; } };
const greeting = () => { const h = new Date().getHours(); return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'; };
const head = ({ crumb, title, sub, actions }) => html`<header class="phead"><div>${crumb && html`<div class="crumb">${crumb}</div>`}<h1>${title}</h1>${sub && html`<p class="sub">${sub}</p>`}</div><div class="phead-actions">${actions}</div></header>`;

function toast(msg, kind = '') {
  const box = $('#toast'); if (!box) return;
  const el = document.createElement('div'); el.textContent = msg; if (kind) el.className = kind;
  box.append(el); setTimeout(() => el.remove(), 3200);
}
function modal(content, { wide = false, cls = '' } = {}) {
  closeModal();
  const d = document.createElement('dialog'); d.className = `modal ${wide ? 'wide' : ''} ${cls}`; d.innerHTML = str(content);
  document.body.append(d); d.addEventListener('close', () => d.remove());
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  d.showModal(); hydrateImages(d); return d;
}
const closeModal = () => $$('dialog.modal').forEach(d => d.close());

/* ---------- роутер ---------- */
const ROUTES = [];
function route(pattern, fn, opts = {}) {
  ROUTES.push({ re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn, ...opts });
}
let navId = 0;
async function navigate() {
  const id = ++navId, [path, qs] = (location.hash.slice(1) || '/').split('?');
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  const hit = ROUTES.map(r => [r, r.re.exec(path)]).find(([, m]) => m);
  if (!hit) { if (!S.user) return (location.hash = '#/login'); return renderShell(path, empty('Страница не найдена', 'Проверьте адрес или вернитесь на главную.', html`<a class="btn" href="#/">На главную</a>`)); }
  const [r, m] = hit;
  if (r.auth !== false && !S.user) { S.pending = location.hash; return (location.hash = '#/login'); }
  if (r.auth === false && S.user && !r.always) return (location.hash = '#/');
  if (r.roles && !r.roles.includes(S.user.role)) return renderShell(path, empty('Недостаточно прав', 'Этот раздел доступен другим ролям.', html`<a class="btn" href="#/">На главную</a>`));
  if (r.auth === false) { $('#app').innerHTML = str(await r.fn({ ...m.groups, q })); afterRender(); return; }
  if (!window.__silent) renderShell(path, skeleton());
  try {
    const out = await r.fn({ ...m.groups, q });
    if (id !== navId) return;
    renderShell(path, out.html, out.title); if (out.mount) out.mount();
  } catch (e) {
    if (id !== navId) return;
    renderShell(path, empty('Не удалось загрузить', e.message, html`<button class="btn" data-act="reload">Повторить</button>`));
  }
}
function afterRender() { hydrateImages(); tickSla(); }

/* ---------- оболочка ---------- */
function navItems() {
  const r = S.user.role;
  const home = { teacher: 'Главная', worker: 'Мои задачи' }[r] || 'Обзор';
  return [['/', 'home', home], ['/requests', 'list', r === 'teacher' ? 'Мои заявки' : 'Заявки'], ['/plan', 'map', 'План школы'], ['/passports', 'map', 'Паспорта кабинетов'],
    ...(['admin', 'director', 'worker'].includes(r) ? [['/maintenance', 'check', 'Плановые осмотры']] : []),
    ...(['admin', 'director'].includes(r) ? [['/ai-usage', 'chart', 'Статистика ИИ']] : []),
    ...(['admin', 'director', 'worker'].includes(r) ? [['/analytics', 'chart', 'Аналитика']] : []),
    ...(r === 'admin' ? [['/admin', 'shield', 'Управление']] : []), ['/demo', 'play', 'Сценарий показа']];
}
// В верхней строке — только самое нужное; остальное — в меню «Ещё»
const MAIN_PATHS = { teacher: ['/', '/requests', '/plan'], worker: ['/', '/requests', '/plan'], admin: ['/', '/requests', '/plan', '/analytics', '/admin'], director: ['/', '/requests', '/plan', '/analytics'] };
const navMain = () => navItems().filter(([p]) => (MAIN_PATHS[S.user.role] || MAIN_PATHS.admin).includes(p));
const navMore = () => navItems().filter(([p]) => !(MAIN_PATHS[S.user.role] || MAIN_PATHS.admin).includes(p));
const TABS = {
  teacher: [['/', 'home', 'Главная'], ['/new', 'plus', 'Новая'], ['/requests', 'list', 'Заявки'], ['/plan', 'map', 'План']],
  worker: [['/', 'home', 'Задачи'], ['/requests', 'list', 'Заявки'], ['/plan', 'map', 'План'], ['/notifications', 'bell', 'События']],
  admin: [['/', 'home', 'Обзор'], ['/requests', 'list', 'Заявки'], ['/plan', 'map', 'План'], ['/analytics', 'chart', 'Аналитика']]
};
TABS.director = TABS.admin;
const isOn = (p, path) => p === '/' ? path === '/' : path === p || path.startsWith(p + '/');
function renderShell(path, content, title) {
  if (!$('#view')) {
    const u = S.user;
    $('#app').innerHTML = str(html`<div class="shell"><header class="topbar"><div class="topbar-in">
      <a class="brand" href="#/">Школа<em>+</em></a><nav class="nav" id="nav" aria-label="Разделы"></nav>
      <div class="topbar-r">${['teacher', 'admin'].includes(u.role) && html`<a class="cta" href="#/new">${ic('plus')}<span>Новая заявка</span></a>`}
        <a class="iconbtn" href="#/notifications" aria-label="Уведомления">${ic('bell')}<b class="dot" id="badge" hidden>0</b></a>
        <a class="me" href="#/profile" title="Профиль и выход"><span class="avatar">${initials(u.name)}</span><span class="me-name">${u.name.split(' ')[0]}</span></a></div></div></header><main id="view"></main><nav class="tabbar" id="tabbar" aria-label="Быстрая навигация"></nav></div>`);
    refreshBadge();
  }
  if (!window.__silent) closeModal();
  const more = navMore();
  $('#nav').innerHTML = str(html`${navMain().map(([p, i, l]) => html`<a href="#${p}" class="${isOn(p, path) ? 'on' : ''}">${l}</a>`)}${more.length && html`<button type="button" class="more-btn ${more.some(([p]) => isOn(p, path)) ? 'on' : ''}" data-act="moreMenu">Ещё ▾</button>`}`);
  const tabs = TABS[S.user.role] || TABS.admin;
  $('#tabbar').innerHTML = str(html`${tabs.map(([p, i, l]) => html`<a href="#${p}" class="${isOn(p, path) ? 'on' : ''}">${ic(i)}<span>${l}</span></a>`)}${more.length && html`<button type="button" class="tab-more" data-act="moreMenu">${ic('menu')}<span>Ещё</span></button>`}`);
  $('#view').innerHTML = str(content);
  document.title = (title ? title + ' · ' : '') + 'ШКОЛА+'; afterRender();
  if (!window.__keepScroll) window.scrollTo(0, 0);
}
async function refreshBadge() {
  if (!S.user) return;
  try { const n = await api('/api/notifications'), c = n.filter(x => !x.read).length, b = $('#badge'); if (b) { b.textContent = c; b.hidden = !c; } } catch { /* не критично */ }
}

/* ---------- делегирование событий ---------- */
const ACT = {}, FORM = {};
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (el && ACT[el.dataset.act]) { e.preventDefault(); ACT[el.dataset.act](el, e); } });
document.addEventListener('submit', e => { const f = e.target.closest('form[data-form]'); if (f) { e.preventDefault(); FORM[f.dataset.form]?.(f, e); } });
document.addEventListener('change', e => { const el = e.target.closest('[data-change]'); if (el) ACT[el.dataset.change]?.(el, e); });
document.addEventListener('input', e => { const el = e.target.closest('[data-input]'); if (el) ACT[el.dataset.input]?.(el, e); });
