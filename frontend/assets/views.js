'use strict';
/* ШКОЛА+ · экраны */
const canCreate = () => ['teacher', 'admin'].includes(S.user.role);
const bySla = (a, b) => new Date(a.sla_due_at || 8e15) - new Date(b.sla_due_at || 8e15);
const planUrl = ({ floor = 1, room, mode = 'status' }) => `#/plan?floor=${floor}${room ? '&room=' + room : ''}${mode === 'heat' ? '&mode=heat' : ''}`;
function enter(token, user) {
  clearImageCache(); setSession(token, user); $('#app').innerHTML = '';
  const target = S.pending || '#/'; S.pending = null;
  if (location.hash === target) navigate(); else location.hash = target;
}
const roomWord = n => { const m = n % 10, c = n % 100; return m === 1 && c !== 11 ? 'заявка' : (m >= 2 && m <= 4 && (c < 12 || c > 14)) ? 'заявки' : 'заявок'; };

/* ================= вход / регистрация ================= */
function chalkPlan() {
  const lit = new Set([1, 6]); let g = '';
  for (let i = 0; i < 4; i++) for (const [row, y, base] of [[0, 28, 1], [1, 182, 5]]) {
    const x = 36 + i * 122, n = 100 + (row ? i + 5 : i + 1), on = lit.has(i + row * 4);
    g += `<rect x="${x}" y="${y}" width="112" height="90" rx="2" style="fill:${on ? 'var(--accent)' : 'none'};fill-opacity:${on ? .16 : 0}" ${on ? 'class="pl"' : ''} stroke="currentColor" stroke-width="1.5" stroke-dasharray="${on ? '0' : '6 5'}"/>`
      + `<text x="${x + 10}" y="${y + 26}" style="fill:${on ? 'var(--accent)' : 'currentColor'}" font-family="Palatino Linotype,Georgia,serif" font-size="20" font-weight="600">${n}</text>`;
  }
  return raw(`<svg class="chalk" viewBox="0 0 560 300" role="img" aria-label="Схема этажа">${g}<text x="280" y="155" text-anchor="middle" fill="currentColor" fill-opacity=".6" font-family="ui-monospace,Consolas,monospace" font-size="12" letter-spacing="6">КОРИДОР</text></svg>`);
}
const authSide = html`<div class="auth-l"><a class="brand" href="#/login">Школа<em>+</em></a><div>${chalkPlan()}</div><div><h2>Каждая поломка — с номером, сроком и исполнителем.</h2><p>Заявки из кабинетов попадают к нужному работнику, а директор видит, где школе нужно внимание.</p></div></div>`;
route('/login', () => html`<div class="auth">${authSide}<div class="auth-r"><form class="auth-f" data-form="login">
  <a class="brand auth-brand" href="#/login">Школа<em>+</em></a>
  <div><h1>Вход</h1><p class="muted" style="margin-top:4px">Введите логин и пароль.</p></div>
  <div class="fld"><label for="lg">Логин</label><input class="input" id="lg" autocomplete="username" autofocus required></div>
  <div class="fld"><label for="pw">Пароль</label><input class="input" id="pw" type="password" autocomplete="current-password" required><button type="button" class="btn ghost sm" data-act="togglePass" data-target="pw">Показать пароль</button></div>
  <button class="btn xl">Войти</button>
  <p class="muted">Нет аккаунта? <a href="#/register" class="lnk">Зарегистрироваться</a></p>
</form></div></div>`, { auth: false });
route('/register', () => html`<div class="auth">${authSide}<div class="auth-r"><form class="auth-f" data-form="register"><a class="brand auth-brand" href="#/login">Школа<em>+</em></a>
  <div><h1>Регистрация</h1><p class="muted" style="margin-top:4px">Пароль — не короче 6 символов.</p></div>
  <div class="fld"><label for="rn">Имя и фамилия</label><input class="input" id="rn" required minlength="2"></div>
  <div class="fld"><label for="rl">Логин</label><input class="input" id="rl" autocomplete="username" required minlength="3"></div>
  <div class="fld"><label for="rp">Пароль</label><input class="input" id="rp" type="password" autocomplete="new-password" required minlength="6"></div>
  <div class="fld"><label for="invite-code">Персональный код от администратора</label><input class="input" id="invite-code" required minlength="16" autocomplete="off" placeholder="SCH-…"><p class="muted sm">Для регистрации учителя потребуется одноразовый код, выданный администрацией школы.</p></div>
  <button class="btn xl">Создать аккаунт</button><p class="muted"><a href="#/login" class="lnk">Вернуться ко входу</a></p></form></div></div>`, { auth: false });
async function doLogin(login, password) {
  try { const d = await api('/api/login', { method: 'POST', body: { login: login.trim(), password } }); enter(d.token, d.user); toast('Добро пожаловать, ' + d.user.name.split(' ')[0]); }
  catch (e) { toast(e.message, 'err'); }
}
ACT.togglePass = el => { const p=$('#'+el.dataset.target); p.type=p.type==='password'?'text':'password'; el.textContent=p.type==='password'?'Показать пароль':'Скрыть пароль'; };
FORM.login = () => doLogin($('#lg').value, $('#pw').value);
ACT.demoLogin = el => doLogin(el.dataset.v, '1234');
FORM.register = async () => {
  try { const d = await api('/api/register', { method: 'POST', body: { name: $('#rn').value.trim(), login: $('#rl').value.trim(), password: $('#rp').value, role: 'teacher', invite_code: $('#invite-code').value.trim() } }); enter(d.token, d.user); toast('Аккаунт создан'); }
  catch (e) { toast(e.message, 'err'); }
};

/* ================= обзор ================= */
const FRIENDLY = { rework: 'Возвращена на доработку', new: 'Ждёт назначения работника', accepted: 'Работник назначен', working: 'Работник уже занимается', done: 'Готово', rejected: 'Отклонена' };
const rowReq = r => { const t = S.user.role === 'teacher'; return html`<a class="row" href="#/request/${r.id}">${plate(r.room)}<div style="min-width:0"><div class="t">${r.description || r.detected_problem || 'Без описания'}</div>
  <div class="m">${t ? html`<span class="pill st-${r.status}">${FRIENDLY[r.status]}</span><span>${CAT[r.category] || ''}</span><span>${ago(r.created_at)}</span>` : html`${statusPill(r.status)}${prioTag(r.priority)}<span>${CAT[r.category] || ''}</span>${slaBadge(r)}`}</div></div><span class="mono muted sm">#${r.id}</span></a>`; };
route('/', async () => {
  const [reqs, rooms] = await Promise.all([api('/api/requests'), api('/api/rooms')]);
  if (S.user.role === 'teacher') return teacherHome(reqs, rooms);
  if (S.user.role === 'worker') return workerHome(reqs);
  if (S.user.role === 'director') return directorHome();
  const u = S.user, teacher = u.role === 'teacher', act = reqs.filter(isActive);
  const over = act.filter(r => r.sla_state === 'overdue').length, crit = act.filter(r => r.priority === 'critical').length;
  const k = teacher ? [['Всего заявок', reqs.length], ['Активные', act.length], ['Подтверждено', reqs.filter(r => r.status === 'done' && r.confirmed_at).length], ['Ждут оценки', reqs.filter(r => r.status === 'done' && r.confirmed_at && !r.rating).length]]
    : [['Активные', act.length], ['Просрочено', over, over ? 'bad' : 'good'], ['Критические', crit, crit ? 'bad' : ''], ['Без исполнителя', act.filter(r => !r.worker_id).length]];
  const list = (teacher ? reqs.slice().sort((a, b) => b.id - a.id) : act.slice().sort(bySla)).slice(0, 7);
  const sub = { teacher: 'Следите за своими обращениями и сообщайте о поломках.', worker: 'Сначала самые срочные заявки.', admin: 'Контроль очереди, исполнителей и сроков.', director: 'Сводка по состоянию школы и качеству обслуживания.' }[u.role];
  return {
    title: 'Обзор', html: html`${head({ crumb: new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }), title: `${greeting()}, ${u.name.split(' ')[0]}`, sub })}
    <div class="ledger">${k.map(([l, v, c]) => html`<div class="${c || ''}"><span>${l}</span><b>${v}</b></div>`)}</div>
    <div class="grid2"><section class="panel"><h2>${teacher ? 'Последние заявки' : 'Требует внимания'}<a class="sm" style="text-transform:none;letter-spacing:0" href="#/requests">Все заявки →</a></h2>
      <div class="rows">${list.length ? list.map(rowReq) : empty(teacher ? 'Заявок пока нет' : 'Всё спокойно', teacher ? 'Если что-то сломалось — создайте заявку.' : 'Активных заявок нет.', canCreate() && html`<a class="btn" href="#/new">Создать заявку</a>`)}</div></section>
    <section class="panel"><h2>Состояние кабинетов<a class="sm" style="text-transform:none;letter-spacing:0" href="#/plan">План →</a></h2>
      <div class="pulse">${[...new Set(rooms.map(r=>r.floor))].sort((a,b)=>a-b).map(f => html`<div class="fl"><span>${f} этаж</span><div class="cells">${rooms.filter(r => r.floor === f).map(r => html`<a href="${planUrl({ floor: f, room: r.id })}" class="${r.worst ? 'w' + r.worst : ''}" title="Кабинет ${r.number}${r.active ? ': ' + r.active + ' ' + roomWord(r.active) : ''}">${r.number.slice(1)}</a>`)}</div></div>`)}</div>
      <div class="legend"><span><i style="background:var(--surface-2)"></i>норма</span><span><i style="background:var(--med)"></i>средний</span><span><i style="background:var(--high)"></i>высокий</span><span><i style="background:var(--crit)"></i>критический</span></div></section></div>`
  };
});

async function directorHome() {
  const d = await api('/api/dashboard/director'), s=d.stats;
  return { title:'Панель директора',html:html`${head({title:'Состояние школы',sub:'Оперативная сводка по безопасности и ремонту помещений.',actions:html`<button class="btn alt" data-act="pdfDirector">${ic('dl')}Отчёт PDF</button>`})}
  <div class="ledger director-ledger"><div><span>Всего обращений</span><b>${s.total}</b></div><div><span>В работе</span><b>${s.active}</b></div><div class="${s.urgent?'bad':'good'}"><span>Срочные</span><b>${s.urgent}</b></div><div><span>Ожидают назначения</span><b>${s.unassigned}</b></div></div>
  <section class="panel critical-panel"><h2>Приоритетные обращения <span>${d.alerts.length}</span></h2><div class="rows">${d.alerts.length?d.alerts.map(r=>html`<a class="row" href="#/request/${r.id}"><b>Каб. ${r.room}</b><div><b>${r.description||'Требуется осмотр'}</b><p class="muted sm">Заявка №${r.id}</p></div>${prioTag(r.priority)}</a>`):empty('Срочных заявок нет','Обращения высокой и критической срочности появятся здесь.')}</div></section>
  <div class="dashboard-shortcuts"><a class="btn alt" href="#/analytics">Подробная аналитика →</a><a class="btn alt" href="#/requests">Все заявки →</a><a class="btn alt" href="#/notifications">Уведомления →</a></div>`};
}
ACT.pdfDirector=()=>download('/api/export/director.pdf','schoolflow_director_report.pdf').catch(e=>toast(e.message,'err'));

const firstName = () => S.user.name.split(' ')[0];
const dateLine = () => new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
const recentIds = () => { try { return JSON.parse(localStorage.getItem('sp_recent') || '[]'); } catch { return []; } };
const pushRecent = id => localStorage.setItem('sp_recent', JSON.stringify([id, ...recentIds().filter(x => x !== id)].slice(0, 4)));
function teacherHome(reqs, rooms) {
  const mine = reqs.slice().sort((a, b) => b.id - a.id), act = mine.filter(isActive), unrated = mine.filter(r => r.status === 'done' && r.confirmed_at && !r.rating);
  const recent = recentIds().map(id => rooms.find(r => r.id === id)).filter(Boolean);
  return {
    title: 'Главная', html: html`${head({ crumb: dateLine(), title: `${greeting()}, ${firstName()}`, sub: 'Сообщите о поломке за минуту — заявка сразу попадёт к нужному работнику.' })}
    <section class="hero"><div><h2>Что-то сломалось?</h2><p>Заявка займёт минуту.</p></div>
      <div class="hero-act"><a class="btn xl" href="#/new">${ic('plus')}Сообщить о проблеме</a>${recent.length ? html`<div class="chips"><span class="muted sm">Недавние:</span>${recent.map(r => html`<a class="chip" href="#/new?room=${r.id}">Каб. ${r.number}</a>`)}</div>` : ''}</div></section>
    ${unrated.length ? html`<section class="panel" style="margin-bottom:48px"><h2>Оцените выполненную работу<span>${unrated.length}</span></h2><div class="rows">${unrated.slice(0, 3).map(rowReq)}</div></section>` : ''}
    <section class="panel"><h2>Ваши активные заявки<a href="#/requests">Все заявки →</a></h2><div class="rows">${act.length ? act.slice(0, 8).map(rowReq) : empty('Активных заявок нет', 'Когда что-то сломается, создайте заявку — здесь появится её статус.')}</div></section>`
  };
}
const taskCard = r => {
  const tools = aiList(r.ai_tools), n = NEXT[r.status];
  return html`<article class="task p-${r.priority}"><a class="task-main" href="#/request/${r.id}">
    <div class="task-top">${plate('№ ' + r.room, 'lg')}<span class="muted">${r.floor ? r.floor + ' этаж' : ''}</span>${prioTag(r.priority)}${slaBadge(r)}</div>
    <h3>${r.description || r.detected_problem || 'Без описания'}</h3>
    <div class="m">${statusPill(r.status)}<span class="tag">${CAT[r.category] || 'Другое'}</span>${r.creator ? html`<span class="muted sm">${r.creator}</span>` : ''}</div>
    ${tools.length ? html`<p class="tools"><b>Взять с собой:</b> ${tools.slice(0, 4).join(', ')}</p>` : ''}</a>
    ${r.image ? html`<img class="thumb" data-src="/api/uploads/${encodeURIComponent(r.image)}" alt="Фото проблемы">` : ''}
    <div class="task-act">${n ? html`<button class="btn xl" data-act="advance" data-id="${r.id}" data-to="${n[0]}">${['new','rework'].includes(r.status) ? 'Взять в работу' : n[1]}</button>` : ''}</div></article>`;
};
function workerHome(reqs) {
  const me = S.user.id, mine = reqs.filter(r => isActive(r) && r.worker_id === me).sort(bySla), free = reqs.filter(r => ['new','rework'].includes(r.status) && !r.worker_id).sort(bySla);
  const today = new Date().toDateString(), doneToday = reqs.filter(r => r.status === 'done' && r.completed_at && new Date(r.completed_at).toDateString() === today).length;
  const late = [...mine, ...free].filter(r => r.sla_state === 'overdue').length;
  const k = [['Мои задачи', mine.length], ['Свободные заявки', free.length], ['Просрочено', late, late ? 'bad' : 'good'], ['Сделано сегодня', doneToday]];
  return {
    title: 'Мои задачи', html: html`${head({ crumb: dateLine(), title: `${greeting()}, ${firstName()}`, sub: 'Сначала самые срочные. Следующий шаг — одна кнопка.' })}
    <div class="ledger">${k.map(([l, n, c]) => html`<div class="${c || ''}"><span>${l}</span><b>${n}</b></div>`)}</div>
    <section class="panel" style="margin-bottom:48px"><h2>Мои задачи<span>${mine.length}</span></h2><div class="tasks">${mine.length ? mine.map(taskCard) : empty('Активных задач нет', 'Загляните в свободные заявки ниже.')}</div></section>
    <section class="panel"><h2>Свободные заявки<span>${free.length}</span></h2><div class="tasks">${free.length ? free.map(taskCard) : empty('Свободных заявок нет', 'Новые заявки появятся здесь автоматически.')}</div></section>`
  };
}

/* ================= заявки ================= */
const RQ = { status: 'all', cat: 'all', q: '', view: localStorage.getItem('sp_view') || 'list', data: [] };
const NEXT = { rework: ['accepted', 'Повторно принять'], new: ['accepted', 'Принять'], accepted: ['working', 'Начать'], working: ['done', 'Завершить'] };
const advanceBtn = (r, cls = '') => { const n = NEXT[r.status]; return n ? html`<button class="btn ${cls}" data-act="advance" data-id="${r.id}" data-to="${n[0]}">${n[1]}</button>` : ''; };
const assignBtn = (r, cls = 'alt') => html`<button class="btn ${cls}" data-act="assign" data-id="${r.id}">${r.worker ? 'Сменить исполнителя' : 'Назначить'}</button>`;
function quick(r) {
  if (!isActive(r)) return '';
  if (S.user.role === 'worker') return advanceBtn(r, 'sm');
  if (S.user.role === 'admin') return html`<button class="btn sm alt" data-act="assign" data-id="${r.id}">${r.worker ? 'Сменить' : 'Назначить'}</button>`;
  return '';
}
const rqFiltered = () => {
  const q = RQ.q.trim().toLowerCase();
  return RQ.data.filter(r => (RQ.status === 'all' || (RQ.status === 'active' ? isActive(r) : r.status === RQ.status)) && (RQ.cat === 'all' || r.category === RQ.cat)
    && (!q || [r.id, r.room, r.description, r.detected_problem, r.creator, r.worker, CAT[r.category]].some(v => String(v ?? '').toLowerCase().includes(q))));
};
function rqTable(rows) {
  const T = S.user.role === 'teacher';
  return rows.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>№</th><th>Каб.</th><th>Проблема</th><th>Статус</th>${T ? html`<th>Создана</th>` : html`<th>Приоритет</th><th>Срок</th><th>Исполнитель</th>`}<th></th></tr></thead><tbody>
    ${rows.map(r => html`<tr><td class="mono muted"><a href="#/request/${r.id}" aria-label="Открыть заявку ${r.id}">#${r.id}</a></td><td>${plate(r.room)}</td><td><a class="desc request-open-title" href="#/request/${r.id}" title="Просмотреть заявку">${r.description || r.detected_problem || 'Без описания'}</a><span class="tag">${CAT[r.category] || 'Другое'}</span></td>
    <td>${T ? html`<span class="pill st-${r.status}">${FRIENDLY[r.status] || STATUS[r.status]}</span>` : statusPill(r.status)}</td>
    ${T ? html`<td class="muted">${ago(r.created_at)}</td>` : html`<td>${prioTag(r.priority)}</td><td>${slaBadge(r) || html`<span class="muted">—</span>`}</td><td>${r.worker || html`<span class="muted">не назначен</span>`}</td>`}<td><div class="request-actions"><a class="btn sm alt" href="#/request/${r.id}">Открыть</a>${quick(r)}</div></td></tr>`)}</tbody></table></div>`
    : empty('Ничего не найдено', 'Измените фильтры или поисковый запрос.');
}
function rqBoard(rows) {
  const cols = [['new', 'Новые'], ['rework', 'На доработке'], ['accepted', 'Приняты'], ['working', 'В работе'], ['done', 'Готово']];
  return html`<div class="board-k">${cols.map(([s, l]) => { const items = rows.filter(r => r.status === s).sort(s === 'done' ? (a, b) => b.id - a.id : bySla);
    return html`<div class="col"><h3>${l}<span>${rows.filter(r => r.status === s).length}</span></h3>${items.map(r => html`<a class="kc p-${r.priority}" href="#/request/${r.id}"><div class="m">${plate(r.room)}<span class="mono">#${r.id}</span></div><p>${r.description || r.detected_problem || 'Без описания'}</p>
      <div class="m"><span>${r.worker || 'без исполнителя'}</span>${slaBadge(r)}</div></a>`)}</div>`; })}</div>`;
}
const drawRequests = () => { const el = $('#rq-body'); if (!el) return; const rows = rqFiltered(); el.innerHTML = str(RQ.view === 'board' ? rqBoard(rows) : rqTable(rows)); tickSla(); const c = $('#rq-count'); if (c) c.textContent = `${rows.length} из ${RQ.data.length}`; };
function syncPressed() { $$('[data-act=rqStatus]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === RQ.status))); $$('[data-act=rqView]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === RQ.view))); }
route('/requests', async ({ q }) => {
  RQ.data = await api('/api/requests'); RQ.status = q.status || (['teacher', 'worker'].includes(S.user.role) ? 'active' : 'all'); RQ.cat = 'all'; RQ.q = '';
  const stat = [['all', 'Все'], ['active', 'Активные'], ['new', 'Новые'], ['rework', 'На доработке'], ['accepted', 'Приняты'], ['working', 'В работе'], ['done', 'Готово']];
  return {
    title: 'Заявки', mount: () => { syncPressed(); drawRequests(); },
    html: html`${head({ title: 'Заявки', sub: S.user.role === 'teacher' ? 'Только ваши обращения.' : 'Список, фильтры и доска по статусам.' })}
    <section class="panel"><div class="toolbar"><input class="input" style="width:240px" placeholder="Поиск: кабинет, текст, имя…" data-input="rqSearch" aria-label="Поиск">
      <div class="chips">${stat.map(([v, l]) => html`<button class="chip" data-act="rqStatus" data-v="${v}" aria-pressed="false">${l}</button>`)}</div>
      <select class="select" data-change="rqCat" aria-label="Категория"><option value="all">Все категории</option>${Object.entries(CAT).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select>
      <span class="muted sm mono" id="rq-count" style="margin-left:auto"></span>
      <div class="seg"><button data-act="rqView" data-v="list" aria-pressed="false">Список</button><button data-act="rqView" data-v="board" aria-pressed="false">Доска</button></div></div>
      <div id="rq-body"></div></section>`
  };
});
ACT.rqSearch = el => { RQ.q = el.value; drawRequests(); };
ACT.rqCat = el => { RQ.cat = el.value; drawRequests(); };
ACT.rqStatus = el => { RQ.status = el.dataset.v; syncPressed(); drawRequests(); };
ACT.rqView = el => { RQ.view = el.dataset.v; localStorage.setItem('sp_view', RQ.view); syncPressed(); drawRequests(); };
ACT.open = el => { location.hash = '#/request/' + el.dataset.id; };
ACT.reload = () => navigate();
async function mutate(fn, ok) { try { await fn(); if (ok) toast(ok); window.__keepScroll = true; await navigate(); window.__keepScroll = false; refreshBadge(); } catch (e) { toast(e.message, 'err'); } }
ACT.advance = el => {
  const { id, to } = el.dataset; if (to === 'done') return completeModal(id);
  mutate(() => api(`/api/requests/${id}`, { method: 'PATCH', body: { status: to } }), 'Статус обновлён');
};
ACT.cancel = el => confirm('Отменить заявку?') && mutate(() => api(`/api/requests/${el.dataset.id}/cancel`, { method: 'PATCH' }), 'Заявка отменена');
ACT.reject = el => confirm('Отклонить заявку? Это действие нельзя отменить.') && mutate(() => api(`/api/requests/${el.dataset.id}`, { method: 'PATCH', body: { status: 'rejected' } }), 'Заявка отклонена');

/* ----- завершение и назначение ----- */
function completeModal(id) {
  modal(html`<form data-form="complete" data-id="${id}"><div class="mh">Завершить заявку #${id}<button type="button" class="btn ghost sm" data-act="closeModal" aria-label="Закрыть">${ic('x')}</button></div>
    <div class="mb"><div class="fld"><label for="c-res">Что сделано</label><textarea class="textarea" id="c-res" required placeholder="Например: заменили розетку и проверили напряжение"></textarea><div class="chips">${['Заменили деталь', 'Отремонтировали на месте', 'Настроили и проверили', 'Почистили', 'Подтянули крепёж'].map(t => html`<button type="button" class="chip" data-act="fillRes" data-v="${t}">${t}</button>`)}</div></div>
    <div class="fld"><label for="c-mat">Материалы и инструменты</label><input class="input" id="c-mat" required placeholder="Розетка, отвёртка"></div>
    <div class="fld"><label for="c-img">Фото после ремонта</label><input class="input" id="c-img" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required style="padding-top:7px"></div>
    <div class="progress" id="c-prog" hidden><i></i></div></div><div class="mf"><button type="button" class="btn alt" data-act="closeModal">Отмена</button><button class="btn" id="c-btn">Завершить</button></div></form>`);
}
ACT.closeModal = closeModal;
ACT.moreMenu = () => modal(html`<div class="mh"><span>Другие разделы</span><button class="btn ghost sm" data-act="closeModal" aria-label="Закрыть">${ic('x')}</button></div>
  <nav class="more-list" aria-label="Другие разделы">${navMore().map(([p, i, l]) => html`<a href="#${p}">${ic(i)}<span>${l}</span></a>`)}
  <a href="#/notifications">${ic('bell')}<span>Уведомления</span></a><a href="#/profile">${ic('user')}<span>Профиль и выход</span></a></nav>`);
ACT.fillRes = el => { const t = $('#c-res'); t.value = (t.value.trim() ? t.value.trim() + '. ' : '') + el.dataset.v; t.focus(); };
FORM.complete = async f => {
  const id = f.dataset.id, file = $('#c-img').files[0], b = $('#c-btn');
  if (file && file.size > 8 * 1024 * 1024) return toast('Фото больше 8 МБ', 'err');
  const fd = new FormData(); fd.append('resolution', $('#c-res').value); fd.append('materials', $('#c-mat').value); fd.append('after_image', file);
  b.disabled = true; $('#c-prog').hidden = false;
  try { await sendForm(`/api/requests/${id}/complete`, fd, p => { $('#c-prog i').style.width = p + '%'; }); closeModal(); toast('Заявка завершена'); await navigate(); }
  catch (e) { toast(e.message, 'err'); b.disabled = false; $('#c-prog').hidden = true; }
};
async function assignModal(id) {
  try {
    const [w, r] = await Promise.all([api('/api/admin/workers'), api(`/api/requests/${id}`)]);
    modal(html`<div class="mh">Исполнитель для заявки #${id}<button class="btn ghost sm" data-act="closeModal" aria-label="Закрыть">${ic('x')}</button></div>
      <div class="mb"><div class="fld"><label for="as-w">Работник</label><select class="select" id="as-w">${w.map(x => html`<option value="${x.id}" ${x.id === r.worker_id ? 'selected' : ''}>${x.name} · активных: ${x.active}</option>`)}</select></div>
      <p class="sm muted">«Автовыбор» назначит работника с наименьшей текущей нагрузкой.</p></div>
      <div class="mf"><button class="btn alt" data-act="doAssign" data-id="${id}" data-auto="1">Автовыбор</button><button class="btn" data-act="doAssign" data-id="${id}">Назначить</button></div>`);
  } catch (e) { toast(e.message, 'err'); }
}
ACT.assign = el => assignModal(el.dataset.id);
ACT.doAssign = el => { const auto = !!el.dataset.auto, wid = auto ? 0 : +$('#as-w').value; closeModal(); mutate(() => api(`/api/admin/requests/${el.dataset.id}/assign?worker_id=${wid}&auto=${auto}`, { method: 'PATCH' }), 'Исполнитель назначен'); };

/* ================= карточка заявки ================= */
function aiPanel(r) {
  if (r.ai_status === 'unavailable' && r.image) return html`<section class="ai-pro"><div class="ai-pro-head"><span class="ai-logo">✦</span><div><b>ШКОЛА+ AI</b><small>Анализ фотографии недоступен</small></div></div><p class="muted">Заявка сохранена. Диагностику выполнит работник.</p></section>`;
  if (r.ai_status === 'pending') return html`<section class="ai-pro" role="status"><b>✦ ИИ анализирует фотографию…</b><p class="muted">Заявка уже сохранена. Обновите карточку через несколько секунд.</p><button class="btn alt" data-act="reload">Обновить результат</button></section>`;
  if (r.ai_status === 'error') return html`<section class="ai-pro"><b>ИИ временно недоступен</b><p class="muted">Заявка сохранена; диагноз можно запросить повторно.</p><button class="btn alt" data-act="retryAI" data-id="${r.id}">Повторить ИИ-анализ</button></section>`;
  if (r.ai_status !== 'ok') return '';
  const L = (title, value, icon) => { const a=aiList(value); return a.length ? html`<section class="ai-group"><h4>${icon} ${title}</h4><ul>${a.map(x=>html`<li>${x}</li>`)}</ul></section>` : ''; };
  return html`<section class="ai-pro ai-enhanced" aria-label="Предварительный анализ искусственного интеллекта">
    <div class="ai-pro-head"><span class="ai-logo" aria-hidden="true">✦</span><div><b>ШКОЛА+ AI</b><small>Предварительная визуальная диагностика</small></div><span class="ai-ready">Анализ завершён</span></div>
    <p class="ai-kicker">ВОЗМОЖНАЯ НЕИСПРАВНОСТЬ</p><h3 class="ai-diagnosis">${r.detected_problem || 'Требуется осмотр'}</h3>
    <div class="chips ai-chips">${r.ai_category && html`<span class="tag">${CAT[r.ai_category] || 'Другое'}</span>`}${r.ai_priority && html`<span class="tag">Приоритет ИИ: ${PRIO[r.ai_priority]}</span>`}${r.ai_estimated_minutes ? html`<span class="tag">≈ ${r.ai_estimated_minutes} мин</span>` : ''}${r.ai_specialist_required && html`<span class="tag">Специалист: ${r.ai_specialist_required}</span>`}</div>
    ${r.ai_priority && r.ai_priority !== r.priority ? html`<p class="ai-warning">Внимание: оценка срочности ИИ отличается от выбранного приоритета. Проверьте вручную.</p>` : ''}
    ${r.ai_danger_level ? html`<div class="ai-danger ai-danger-${r.ai_danger_level}" role="alert"><strong>${({low:'Низкая',medium:'Средняя',high:'Высокая',critical:'КРИТИЧЕСКАЯ'})[r.ai_danger_level] || 'Неизвестная'} степень опасности</strong><p>${r.ai_human_review ? 'Требуется срочная проверка ответственным человеком. Администрации отправлено уведомление внутри системы.' : 'Предварительная оценка по фотографии — не гарантия безопасности.'}</p></div>` : ''}
    ${(S.user.role === 'teacher' || S.user.role === 'admin' || S.user.role === 'director') ? html`<div class="ai-role-teacher">${L('Что сделать учителю прямо сейчас',r.ai_teacher_actions,'☝')}</div>` : ''}
    ${(S.user.role === 'worker' || S.user.role === 'admin' || S.user.role === 'director') ? html`<p class="ai-worker-notice">Подготовка работника: инструменты и материалы предварительные. Проверьте необходимость и безопасность работ на месте.</p>` : ''}
    ${L('Важные предупреждения',r.ai_safety,'⚠')}
    ${(S.user.role !== 'teacher') ? html`<div class="ai-pair ai-worker-kit">${L('Инструменты — взять с собой',r.ai_tools,'⚒')}${L('Материалы — уточнить по месту',r.ai_materials,'▤')}</div>` : ''}
    ${S.user.role !== 'teacher' ? html`${L('Что проверить работнику',r.ai_checks,'✓')}${L('Предварительные действия работника',r.ai_actions,'→')}` : ''}
    ${r.ai_answer ? html`<p class="ai-ok">Диагноз обновлён с учётом ответа: ${r.ai_answer}</p>` : ''}${r.ai_question ? html`<section class="ai-question"><h4>✦ Уточнение от ИИ</h4><p>${r.ai_question}</p>${r.ai_answer ? html`<div class="ai-answered"><b>Ответ:</b> ${r.ai_answer}</div>` : html`<form data-form="aiClarify" data-id="${r.id}"><label for="ai-answer-${r.id}" class="sr">Ответ на уточняющий вопрос</label><textarea class="input" id="ai-answer-${r.id}" rows="2" maxlength="500" required minlength="2" placeholder="Уточните, что происходит…"></textarea><button class="btn alt" type="submit">Уточнить диагноз с ИИ</button></form>`}</section>` : ''}
    <p class="ai-disclaimer">ИИ анализирует видимые признаки, не проводит техническую проверку. Уверенность модели не гарантирует правильность диагноза. Решение принимает специалист.</p>
  </section>`;
}
ACT.retryAI = el => mutate(()=>api(`/api/requests/${el.dataset.id}/ai-retry`,{method:'POST'}),'Повторный анализ запущен');
FORM.aiClarify = f => { const answer=$('#ai-answer-'+f.dataset.id)?.value.trim(); if (!answer || answer.length < 2) return toast('Напишите ответ','err'); mutate(()=>api(`/api/requests/${f.dataset.id}/ai-clarify`,{method:'POST',body:{answer}}),'ИИ уточнил диагноз'); };
ACT.confirmRepair = el => mutate(()=>api(`/api/requests/${el.dataset.id}/confirm`,{method:'POST',body:{accepted:true}}),'Ремонт подтверждён');
ACT.reopenRepair = el => { const comment=prompt('Что осталось неисправным? Опишите причину повторного обращения.'); if (!comment) return; mutate(()=>api(`/api/requests/${el.dataset.id}/confirm`,{method:'POST',body:{accepted:false,comment}}),'Возвращено на доработку'); };
route('/request/:id', async ({ id }) => {
  const [r, hist, com, attempts] = await Promise.all([api(`/api/requests/${id}`), api(`/api/requests/${id}/history`), api(`/api/requests/${id}/comments`),api(`/api/requests/${id}/attempts`)]);
  const u = S.user, mine = r.user_id === u.id, active = isActive(r);
  const acts = [];
  if (u.role === 'teacher' && mine && r.status === 'new') acts.push(html`<button class="btn warn" data-act="cancel" data-id="${r.id}">Отменить заявку</button>`);
  if (u.role === 'worker' && active && (r.worker_id == null || r.worker_id === u.id)) acts.push(advanceBtn(r));
  if (u.role === 'admin' && active) acts.push(assignBtn(r), html`<button class="btn warn" data-act="reject" data-id="${r.id}">Отклонить</button>`);
  const order = ['new', 'accepted', 'working', 'done'], idx = Math.max(0, order.indexOf(r.status));
  const times = [r.created_at, r.accepted_at, r.started_at, r.completed_at], names = ['Создана', 'Принята', 'В работе', 'Готово'];
  const sla = slaInfo(r), used = sla ? Math.min(100, Math.max(0, (sla.total - sla.left) / sla.total * 100)) : 0;
  const slaClosed = r.status === 'done' && r.completed_at && r.sla_due_at ? (new Date(r.completed_at) <= new Date(r.sla_due_at) ? 'Выполнено в срок' : 'Выполнено с опозданием') : null;
  const feed = [...hist.filter(h => h.action !== 'comment').map(h => ({ t: h.created_at, who: h.name || 'Система', text: ACTION[h.action] || h.action, extra: h.action === 'assigned' ? h.details : '' })),
    ...com.map(c => ({ t: c.created_at, who: c.name, text: c.body, c: true }))].sort((a, b) => new Date(a.t) - new Date(b.t));
  const photos = (r.image || r.after_image) && html`<section class="panel"><h2>Фото</h2><div class="photos">${r.image && html`<figure><figcaption>До</figcaption><img data-src="/api/uploads/${encodeURIComponent(r.image)}" alt="Фото проблемы"></figure>`}${r.after_image && html`<figure><figcaption>После ремонта</figcaption><img data-src="/api/uploads/${encodeURIComponent(r.after_image)}" alt="Фото после ремонта"></figure>`}</div></section>`;
  return {
    title: 'Заявка #' + r.id, html: html`${head({ crumb: html`<a href="#/requests">Заявки</a> / #${r.id}`, title: html`${plate('№ ' + r.room, 'lg')} <span style="margin-left:8px">${r.description || r.detected_problem || 'Без описания'}</span>`, sub: `${r.floor} этаж · создана ${fmtDate(r.created_at)}${r.creator ? ' · ' + r.creator : ''}`, actions: acts })}
    <div class="grid-d"><div class="stack">${photos}<section class="panel"><h2>Попытки ремонта</h2><div class="pb">${attempts.length?attempts.map((a,i)=>html`<p class="sm">№ ${i+1} · ${a.outcome==='accepted'?'Подтверждена':a.outcome==='rework'?'Возвращена': 'Ожидает проверки'} · ${fmtDate(a.finished_at)}<br>${a.comment||''}</p>`):html`<p class="muted">Пока нет завершённых попыток.</p>`}</div></section>
      <section class="panel"><h2>Суть заявки</h2><dl class="kv"><dt>Статус</dt><dd>${statusPill(r.status)} ${prioTag(r.priority)}</dd><dt>Описание</dt><dd>${r.description || '—'}</dd><dt>Категория</dt><dd>${CAT[r.category || r.ai_category] || 'Другое'}</dd>
        <dt>Исполнитель</dt><dd>${r.worker || html`<span class="muted">пока не назначен</span>`}</dd>${r.resolution ? html`<dt>Что сделано</dt><dd>${r.resolution}</dd><dt>Материалы</dt><dd>${r.materials || '—'}</dd>` : ''}</dl>${aiPanel(r)}</section>
      <section class="panel"><h2>Обсуждение и история</h2><div class="log">${feed.map(x => html`<div class="${x.c ? 'c' : ''}"><i></i><div><b>${x.who}</b> <span class="muted sm">${fmtDate(x.t)}</span>${x.c ? html`<div class="bubble">${x.text}</div>` : html`<div>${x.text}${x.extra ? ' — ' + x.extra.replace('Назначен работник: ', '') : ''}</div>`}</div></div>`)}</div>
        <form class="compose" data-form="comment" data-id="${r.id}"><input class="input" id="cm" maxlength="1000" placeholder="Написать комментарий…" aria-label="Комментарий"><button class="btn alt">Отправить</button></form></section></div>
    <div class="stack"><section class="panel"><h2>Ход работ</h2><ol class="steps">${order.map((s, i) => html`<li class="${r.status !== 'rejected' && r.status !== 'rework' && i <= idx ? 'on' : ''} ${r.status !== 'rejected' && r.status !== 'rework' && i === idx && active ? 'now' : ''}"><i></i><div><b>${names[i]}</b><span>${times[i] ? fmtDate(times[i]) : 'ожидается'}</span></div></li>`)}</ol>${r.status === 'rework' ? html`<p class="pb"><span class="pill st-rework">Возвращена на доработку · ожидает повторного принятия</span></p>` : ''}${r.status === 'rejected' ? html`<p class="pb" style="padding-top:0"><span class="pill st-rejected">Заявка закрыта без выполнения</span></p>` : ''}</section>
      <section class="panel"><h2>Срок выполнения</h2><div class="pb" style="display:grid;gap:10px">${sla ? html`<div class="meter ${slaCls(sla)}"><i style="width:${used}%"></i></div><div style="display:flex;justify-content:space-between"><span class="sla ${slaCls(sla)}" data-due="${r.sla_due_at}" data-hours="${r.sla_hours}">${slaText(sla)}</span><span class="muted sm">до ${fmtDate(r.sla_due_at)}</span></div>` : html`<b>${slaClosed || 'Закрыта'}</b>`}<p class="sm muted">Норматив для приоритета «${PRIO[r.priority]}»: ${r.sla_hours} ч.</p></div></section>
      ${r.status === 'done' && (mine || u.role==='admin') ? html`<section class="panel"><h2>Подтверждение ремонта</h2><div class="pb">${r.confirmed_at ? html`<p class="ai-ok">✓ Ремонт подтверждён ${fmtDate(r.confirmed_at)}</p>` : html`<p class="muted sm">Посмотрите фото «после» и проверьте результат. Если проблема осталась, верните заявку в работу.</p><div class="confirm-actions"><button class="btn" data-act="confirmRepair" data-id="${r.id}">Подтвердить ремонт</button><button class="btn warn" data-act="reopenRepair" data-id="${r.id}">Проблема осталась</button></div>`}</div></section>` : ''}
      ${r.status === 'done' && r.confirmed_at && mine ? html`<section class="panel"><h2>Оценка работы</h2><div class="pb" style="display:grid;gap:10px">${r.rating ? html`<div class="big">${r.rating}<small class="muted" style="font-size:16px"> / 5</small></div><p>${r.rating_comment || ''}</p>` : html`<form data-form="rate" data-id="${r.id}" style="display:grid;gap:10px"><div class="stars" id="stars">${[1, 2, 3, 4, 5].map(n => html`<button type="button" data-act="star" data-v="${n}">${n}</button>`)}</div><input class="input" id="rc" maxlength="500" placeholder="Комментарий (необязательно)"><button class="btn">Отправить оценку</button></form>`}</div></section>` : ''}</div></div>`
  };
});
FORM.comment = async f => { const i = $('#cm'), body = i.value.trim(); if (!body) return; try { await api(`/api/requests/${f.dataset.id}/comments`, { method: 'POST', body: { body } }); window.__keepScroll = true; await navigate(); window.__keepScroll = false; } catch (e) { toast(e.message, 'err'); } };
let rating = 0;
ACT.star = el => { rating = +el.dataset.v; $$('#stars button').forEach(b => b.classList.toggle('on', +b.dataset.v <= rating)); };
FORM.rate = f => { if (!rating) return toast('Выберите оценку', 'err'); mutate(() => api(`/api/requests/${f.dataset.id}/rating`, { method: 'POST', body: { rating, comment: $('#rc').value } }), 'Спасибо за оценку'); };

/* ================= новая заявка ================= */
const draftKey = () => 'sp_draft_user_' + (S.user?.id ?? 'anonymous');
const NR = { rooms: [], room: null, floor: 1, cat: 'other', prio: 'medium', file: null, previewUrl: null };
function drawPick() {
  const rec = recentIds().map(id => NR.rooms.find(r => r.id === id)).filter(Boolean);
  $('#nr-recent').innerHTML = str(rec.length ? html`<span class="muted sm">Недавние:</span>${rec.map(r => html`<button type="button" class="chip" data-act="nrRoom" data-v="${r.id}" aria-pressed="${String(r.id === NR.room)}">Каб. ${r.number}</button>`)}` : '');
  $('#nr-floors').innerHTML = str([...new Set(NR.rooms.map(r => r.floor))].sort((a,b)=>a-b).map(f => html`<button type="button" class="chip" aria-pressed="${String(f === NR.floor)}" data-act="nrFloor" data-v="${f}">${f} этаж</button>`));
  $('#nr-rooms').innerHTML = str(NR.rooms.filter(r => r.floor === NR.floor).map(r => html`<button type="button" class="rp" aria-pressed="${String(r.id === NR.room)}" data-act="nrRoom" data-v="${r.id}">${r.number}${r.active ? html`<small>${r.active} акт.</small>` : ''}</button>`));
}
async function checkDup() {
  const box = $('#dup'); if (!box) return; box.innerHTML = '';
  if (!NR.room) return;
  try {
    const d = await api(`/api/rooms/${NR.room}/summary`);
    if (d.active_public.length) box.innerHTML = str(html`<div class="notice"><b>В кабинете ${d.room.number} уже есть активные заявки:</b> ${d.active_public.map(x => `${CAT[x.category] || 'Другое'} (${STATUS[x.status]})`).join(', ')}. Возможно, ваша проблема уже известна — проверьте, чтобы не создавать дубль.</div>`);
  } catch { /* предупреждение необязательно */ }
}
function setFile(f) {
  const d = $('.drop'); if (!f) return;
  if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return toast('Нужен файл JPG, PNG или WebP', 'err');
  if (f.size > 8 * 1024 * 1024) return toast('Фото больше 8 МБ', 'err');
  if (NR.previewUrl) URL.revokeObjectURL(NR.previewUrl); NR.previewUrl = URL.createObjectURL(f); NR.file = f; d.innerHTML = str(html`<img src="${NR.previewUrl}" alt="Предпросмотр"><span class="sm">${f.name} · ${Math.round(f.size / 1024)} КБ</span><button type="button" class="btn ghost sm" data-act="nrClear">Убрать фото</button>`);
}
route('/new', async ({ q }) => {
  if (NR.previewUrl) { URL.revokeObjectURL(NR.previewUrl); NR.previewUrl = null; } NR.rooms = await api('/api/rooms'); const pre = NR.rooms.find(r => String(r.id) === q.room);
  Object.assign(NR, { room: pre ? pre.id : null, floor: pre ? pre.floor : (NR.rooms[0]?.floor ?? 1), cat: 'other', prio: 'medium', file: null });
  return {
    title: 'Новая заявка', mount: () => {
      drawPick(); checkDup(); const d = $('.drop'); $('#nr-desc').value = sessionStorage.getItem(draftKey()) || '';
      ['dragenter', 'dragover'].forEach(ev => d.addEventListener(ev, e => { e.preventDefault(); d.classList.add('over'); }));
      ['dragleave', 'drop'].forEach(ev => d.addEventListener(ev, e => { e.preventDefault(); d.classList.remove('over'); }));
      d.addEventListener('drop', e => setFile(e.dataTransfer.files[0]));
    },
    html: html`${head({ crumb: html`<a href="#/requests">Заявки</a> / новая`, title: 'Сообщить о проблеме', sub: 'Выберите кабинет, опишите проблему и отправьте. Фото ускоряет ремонт.' })}
    <form class="form" data-form="newreq">
      <div class="fs"><span class="lb">1. Кабинет</span><div class="chips" id="nr-recent"></div><div class="chips" id="nr-floors"></div><div class="roompick" id="nr-rooms"></div><div id="dup"></div></div>
      <div class="fs"><span class="lb">2. Что случилось</span><div class="chips">${Object.entries(CAT).map(([k, v]) => html`<button type="button" class="chip" data-act="nrCat" data-v="${k}" aria-pressed="${String(k === 'other')}">${v}</button>`)}</div>
        <textarea class="textarea" id="nr-desc" maxlength="1000" placeholder="Например: не работает розетка у окна, искрит при включении" aria-label="Описание" data-input="nrDraft"></textarea><span class="hint">Черновик сохраняется автоматически</span>
        <label class="drop" for="nr-file">${ic('cam')}<b>Перетащите фото или нажмите для выбора</b><span class="sm">JPG, PNG или WebP · до 8 МБ</span></label><input id="nr-file" type="file" accept="image/jpeg,image/png,image/webp" class="sr" data-change="nrFile"></div>
      <div class="fs"><span class="lb">3. Срочность</span><div class="seg" style="justify-self:start">${Object.entries(PRIO).map(([k, v]) => html`<button type="button" data-act="nrPrio" data-v="${k}" aria-pressed="${String(k === 'medium')}">${v}</button>`)}</div><span class="hint" id="nr-hint">Срок реакции: ${PRIO_HINT.medium}</span></div>
      <div class="progress" id="nr-prog" hidden><i></i></div>
      <div style="display:flex;gap:8px"><button class="btn" id="nr-btn">Отправить заявку</button><a class="btn alt" href="#/requests">Отмена</a></div></form>`
  };
}, { roles: ['teacher', 'admin'] });
ACT.nrFloor = el => { NR.floor = +el.dataset.v; drawPick(); };
ACT.nrDraft = el => sessionStorage.setItem(draftKey(), el.value);
ACT.nrRoom = el => { NR.room = +el.dataset.v; NR.floor = NR.rooms.find(r => r.id === NR.room)?.floor ?? NR.floor; drawPick(); checkDup(); };
ACT.nrCat = el => { NR.cat = el.dataset.v; $$('[data-act=nrCat]').forEach(b => b.setAttribute('aria-pressed', String(b === el))); };
ACT.nrPrio = el => { NR.prio = el.dataset.v; $$('[data-act=nrPrio]').forEach(b => b.setAttribute('aria-pressed', String(b === el))); $('#nr-hint').textContent = 'Срок реакции: ' + PRIO_HINT[NR.prio]; };
ACT.nrFile = el => setFile(el.files[0]);
ACT.nrClear = () => { if (NR.previewUrl) URL.revokeObjectURL(NR.previewUrl); NR.previewUrl = null; NR.file = null; $('#nr-file').value = ''; $('.drop').innerHTML = str(html`${ic('cam')}<b>Перетащите фото или нажмите для выбора</b><span class="sm">JPG, PNG или WebP · до 8 МБ</span>`); };
FORM.newreq = async () => {
  const desc = $('#nr-desc').value.trim();
  if (!NR.room) return toast('Выберите кабинет', 'err');
  if (!desc && !NR.file) return toast('Добавьте описание или фото', 'err');
  const fd = new FormData(); fd.append('room_id', NR.room); fd.append('description', desc); fd.append('priority', NR.prio); fd.append('category', NR.cat); if (NR.file) fd.append('image', NR.file);
  const b = $('#nr-btn'); b.disabled = true; b.textContent = NR.file ? 'Загружаем и анализируем…' : 'Отправляем…'; $('#nr-prog').hidden = false;
  try { const d = await sendForm('/api/requests', fd, p => { $('#nr-prog i').style.width = p + '%'; }); pushRecent(NR.room); sessionStorage.removeItem(draftKey()); toast(`Заявка #${d.id} создана`); location.hash = '#/request/' + d.id; }
  catch (e) { toast(e.message, 'err'); b.disabled = false; b.textContent = 'Отправить заявку'; $('#nr-prog').hidden = true; }
};

/* ================= план школы ================= */
route('/plan', async ({ q }) => {
  const rooms = await api('/api/rooms'), selRoom = rooms.find(r => String(r.id) === q.room);
  const floor = +q.floor || (selRoom && selRoom.floor) || rooms[0]?.floor || 1, mode = q.mode === 'heat' ? 'heat' : 'status';
  const fr = rooms.filter(r => r.floor === floor), maxRecent = Math.max(1, ...rooms.map(r => r.recent));
  const cell = r => { const lvl = r.recent ? Math.ceil(r.recent / maxRecent * 4) : 0;
    return html`<a class="rm ${mode === 'heat' ? 'h' + lvl : 'w' + r.worst} ${selRoom && selRoom.id === r.id ? 'sel' : ''}" href="${planUrl({ floor, room: r.id, mode })}"><b>${r.number}</b><span>${mode === 'heat' ? (r.recent ? r.recent + ' за 30 дн.' : '—') : (r.active ? r.active + ' ' + roomWord(r.active) : 'без проблем')}</span></a>`; };
  return {
    title: 'План школы', mount: () => selRoom && loadRoomPanel(selRoom.id),
    html: html`${head({ title: 'План школы', sub: mode === 'heat' ? 'Тепловая карта: где за последние 30 дней заявок было больше всего.' : 'Текущее состояние кабинетов. Нажмите на кабинет, чтобы увидеть детали.' })}
    ${S.user.role==='admin' ? html`<p class="pb"><a class="btn alt" href="#/rooms-settings">Управление кабинетами и этажами →</a></p>` : ''}<div class="floors">${[...new Set(rooms.map(r=>r.floor))].sort((a,b)=>a-b).map(f => html`<a class="chip ${f === floor ? 'on' : ''}" href="${planUrl({ floor: f, mode })}">${f} этаж</a>`)}<span style="flex:1"></span>
      <div class="seg"><a href="${planUrl({ floor, room: selRoom?.id })}"><button aria-pressed="${String(mode === 'status')}">Состояние</button></a><a href="${planUrl({ floor, room: selRoom?.id, mode: 'heat' })}"><button aria-pressed="${String(mode === 'heat')}">Тепловая карта</button></a></div></div>
    <div class="grid-d"><div><div class="plan"><div class="blk st">Лестница</div><div class="rowr">${fr.slice(0, 4).map(cell)}</div><div class="cor">коридор · ${floor} этаж</div><div class="rowr">${fr.slice(4).map(cell)}</div><div class="blk wc">Санузлы</div></div>
      <div class="legend">${mode === 'heat' ? html`<span><i style="background:var(--surface)"></i>нет заявок</span><span><i style="background:color-mix(in srgb,var(--chalk) 38%,var(--surface))"></i>мало</span><span><i style="background:color-mix(in srgb,var(--high) 45%,var(--surface))"></i>много</span><span><i style="background:color-mix(in srgb,var(--crit) 55%,var(--surface))"></i>очаг проблем</span>`
        : html`<span><i style="background:var(--surface)"></i>без проблем</span><span><i style="background:color-mix(in srgb,var(--med) 24%,var(--surface))"></i>средний</span><span><i style="background:color-mix(in srgb,var(--high) 30%,var(--surface))"></i>высокий</span><span><i style="background:color-mix(in srgb,var(--crit) 34%,var(--surface))"></i>критический</span>`}</div></div>
    <aside class="panel" id="roomPanel">${empty('Кабинет не выбран', 'Нажмите на кабинет на плане.')}</aside></div>`
  };
});
async function loadRoomPanel(id) {
  const el = $('#roomPanel'); el.innerHTML = str(skeleton(3));
  try {
    const d = await api(`/api/rooms/${id}/summary`), r = d.room;
    el.innerHTML = str(html`<h2>Кабинет ${r.number}<span class="mono">${r.floor} этаж</span></h2><div class="pb" style="display:grid;gap:12px"><div style="display:flex;gap:8px;flex-wrap:wrap">${canCreate() && html`<a class="btn sm" href="#/new?room=${r.id}">${ic('plus')}Заявка</a>`}<button class="btn sm alt" data-act="qr" data-id="${r.id}" data-number="${r.number}">${ic('qr')}QR-код</button></div>
      <div class="chips">${d.categories.length ? d.categories.map(c => html`<span class="tag">${CAT[c.category] || 'Другое'} · ${c.count}</span>`) : html`<span class="muted sm">Обращений ещё не было</span>`}</div></div>
      <div class="rows" style="border-top:1px solid var(--line)">${d.requests.length ? d.requests.slice(0, 6).map(x => rowReq({ ...x, room: r.number })) : ''}</div>`);
    tickSla();
  } catch (e) { el.innerHTML = str(empty('Не удалось загрузить', e.message)); }
}
ACT.qr = el => {
  const { id, number } = el.dataset;
  modal(html`<div class="mh">QR-код · кабинет ${number}<button class="btn ghost sm no-print" data-act="closeModal" aria-label="Закрыть">${ic('x')}</button></div><div class="mb" style="justify-items:center;text-align:center">
    <img data-src="/api/rooms/${id}/qr?base=${encodeURIComponent(location.origin)}" alt="QR-код кабинета ${number}" style="width:240px;height:240px;border:1px solid var(--line);border-radius:6px;background:#fff;padding:8px">
    <div><b>Кабинет ${number}</b><p class="sm muted">Сканирование откроет форму заявки сразу для этого кабинета.</p>${/^(127\.|localhost)/.test(location.hostname) ? html`<p class="sm muted no-print" style="margin-top:6px">Чтобы код работал с телефонов, запустите систему через start_lan.bat и откройте её по адресу компьютера в школьной сети.</p>` : ''}</div></div>
    <div class="mf no-print"><button class="btn" onclick="window.print()">Печать</button></div>`);
};

/* ================= аналитика ================= */
route('/analytics', async () => {
  const [a, repeats] = await Promise.all([api('/api/analytics'),api('/api/analytics/repeats')]), maxC = Math.max(1, ...a.by_category.map(x => x.count)), maxF = Math.max(1, ...a.by_floor.map(x => x.count));
  const pc = { critical: 'var(--crit)', high: 'var(--high)', medium: 'var(--med)', low: 'var(--low)' }, totalP = Math.max(1, a.by_priority.reduce((s, x) => s + x.count, 0));
  const exp = ['admin', 'director'].includes(S.user.role);
  return {
    title: 'Аналитика', html: html`${head({ title: 'Аналитика', sub: 'Сроки реакции и ремонта, категории и нагрузка исполнителей.', actions: exp && html`<button class="btn alt" data-act="csv">${ic('dl')}Выгрузить CSV</button><button class="btn alt" data-act="pdfDirector">Отчёт PDF</button>` })}
    <section class="ai-pro repeat-pro"><div class="ai-pro-head"><span class="ai-logo">↻</span><div><b>Повторяющиеся неисправности</b><small>Автоматический поиск по истории заявок за ${repeats.days} дней</small></div></div>
      ${repeats.items.length ? html`<div class="repeat-items">${repeats.items.map(x=>html`<div class="repeat-item"><div><b>Кабинет ${x.room} · ${x.label}</b><p class="muted sm">${x.floor} этаж · последнее обращение ${fmtDate(x.latest)} · ${x.active} активных</p></div><b class="repeat-count">${x.count} ×</b></div>`)}</div><p class="sm muted">Рекомендуется комплексная проверка специалистом.</p>` : empty('Повторений не обнаружено','Когда появятся две заявки одной категории в одном кабинете, здесь будет предупреждение.')}
      <p class="ai-disclaimer">${repeats.method}</p></section>
    <div class="ledger"><div><span>Ожидают проверки</span><b>${a.pending_confirmation}</b></div><div><span>Возвраты ремонта</span><b>${a.rework_attempts}</b></div></div><div class="ledger"><div><span>Время реакции</span><b>${fmtMin(a.avg_response_minutes)}</b></div><div><span>Время ремонта</span><b>${fmtMin(a.avg_repair_minutes)}</b></div>
      <div class="${a.sla_compliance == null ? '' : a.sla_compliance >= 80 ? 'good' : 'bad'}"><span>В срок среди подтверждённых</span><b>${a.sla_compliance == null ? '—' : a.sla_compliance + '%'}</b></div><div><span>Выполнено</span><b>${a.completion_rate}<small>% · ${a.done} из ${a.total}</small></b></div></div>
    <div class="grid2" style="grid-template-columns:1fr 1fr"><section class="panel"><h2>Категории проблем</h2><div class="hbar">${a.by_category.length ? a.by_category.map(x => html`<div><span>${x.label}</span><div class="bar"><i style="width:${x.count / maxC * 100}%"></i></div><b>${x.count}</b></div>`) : empty('Нет данных', 'Появятся после первых заявок.')}</div></section>
      <section class="panel"><h2>Заявки по этажам</h2><div class="vbar">${a.by_floor.map(x => html`<div><i style="height:${Math.max(2, x.count / maxF * 100)}%"></i><b>${x.count}</b><span>${x.floor} эт.</span></div>`)}</div></section>
      <section class="panel"><h2>Проблемные кабинеты</h2><div class="rows">${a.by_room.length ? a.by_room.map(x => html`<div class="row" style="grid-template-columns:auto 1fr auto">${plate(x.room)}<span class="muted">${x.floor} этаж</span><b>${x.count}</b></div>`) : empty('Нет данных', '')}</div></section>
      <section class="panel"><h2>Исполнители</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Имя</th><th>Назначено</th><th>Готово</th><th>Ср. ремонт</th></tr></thead><tbody>${a.by_worker.map(x => html`<tr><td><b>${x.worker}</b></td><td>${x.assigned}</td><td>${x.done || 0}</td><td>${fmtMin(x.avg_repair)}</td></tr>`)}</tbody></table></div></section>
      <section class="panel"><h2>Приоритеты</h2><div class="stackbar">${a.by_priority.map(x => html`<i style="width:${x.count / totalP * 100}%;background:${pc[x.priority]}" title="${PRIO[x.priority]}: ${x.count}"></i>`)}</div><div class="legend">${a.by_priority.map(x => html`<span><i style="background:${pc[x.priority]}"></i>${PRIO[x.priority]} · ${x.count}</span>`)}</div></section>
      <section class="panel"><h2>Качество сервиса</h2><div class="pb"><div class="big">${a.avg_rating ?? '—'}<small class="muted" style="font-size:16px"> / 5</small></div><p class="muted sm" style="margin-top:6px">Оценок: ${a.ratings_count || 0} · просрочено сейчас: ${a.overdue}</p></div></section></div>`
  };
}, { roles: ['admin', 'director', 'worker'] });
ACT.csv = () => download('/api/export/requests.csv', 'school_plus_requests.csv').catch(e => toast(e.message, 'err'));

/* ================= управление ================= */
route('/admin', async () => {
  const [users, workers, invites] = await Promise.all([api('/api/admin/users'), api('/api/admin/workers'), api('/api/admin/teacher-invites')]), maxA = Math.max(1, ...workers.map(w => w.active));
  return {
    title: 'Управление', html: html`${head({ title: 'Управление', sub: 'Доступ сотрудников, приглашения, нагрузка и контроль работы.' })}
    <div class="grid2" style="grid-template-columns:1.2fr 1fr"><section class="panel"><h2>Пользователи</h2><div class="rows">${users.map(x => html`<div class="row" style="grid-template-columns:1fr auto"><div><div class="t">${x.name}</div><div class="m"><span class="mono">${x.login}</span></div></div>
      <select class="select" data-change="role" data-id="${x.id}" aria-label="Роль ${x.name}">${Object.entries(ROLE).map(([k, v]) => html`<option value="${k}" ${k === x.role ? 'selected' : ''}>${v}</option>`)}</select></div>`)}</div></section>
    <div class="stack"><section class="panel invite-panel"><h2>Доступ учителей</h2><p class="muted sm">Регистрация доступна только по персональному одноразовому коду. Срок действия — 7 дней.</p><button class="btn" data-act="generateTeacherInvite">Создать код учителю</button><div class="invite-result" id="invite-result" role="status" aria-live="polite"></div><p class="muted sm">Выдано: ${invites.length} · использовано: ${invites.filter(i => i.used_at).length}. Код виден только при создании.</p></section><section class="panel"><h2>Нагрузка исполнителей</h2><div class="hbar">${workers.length ? workers.map(w => html`<div><span>${w.name.split(' ')[0]}</span><div class="bar"><i style="width:${w.active / maxA * 100}%"></i></div><b>${w.active}</b></div>`) : empty('Нет работников', '')}</div></section>
      <section class="panel"><h2>Демо-данные</h2><div class="pb" style="display:grid;gap:12px"><p class="sm muted">Добавляет 16 тестовых заявок разных статусов, чтобы показать аналитику и карту на защите. Их можно удалить в один клик.</p><div style="display:flex;gap:8px"><button class="btn" data-act="seed">Добавить</button><button class="btn warn" data-act="unseed">Удалить демо-данные</button></div></div></section></div></div>`
  };
}, { roles: ['admin'] });
ACT.generateTeacherInvite = async () => {
  try {
    const r = await api('/api/admin/teacher-invites',{method:'POST'});
    const out = $('#invite-result');
    if (out) out.innerHTML = str(html`<div class="invite-code"><b>${r.code}</b><button class="btn sm alt" data-act="copyTeacherInvite" data-code="${r.code}">Копировать</button></div><p class="muted sm">Действует до ${r.expires_at}. Передайте код только нужному учителю.</p>`);
    toast('Приглашение создано');
  } catch(e) {toast(e.message,'err');}
};
ACT.copyTeacherInvite = async el => {try { await navigator.clipboard.writeText(el.dataset.code); toast('Код скопирован'); }catch {toast('Выделите и скопируйте код вручную','err');}};
ACT.role = async el => { try { await api(`/api/admin/users/${el.dataset.id}?role=${encodeURIComponent(el.value)}`, { method: 'PATCH' }); toast('Роль обновлена'); } catch (e) { toast(e.message, 'err'); navigate(); } };
ACT.seed = () => mutate(async () => { const d = await api('/api/admin/demo-seed', { method: 'POST' }); toast(`Добавлено заявок: ${d.added}`); });
ACT.unseed = () => confirm('Удалить все демо-заявки?') && mutate(async () => { const d = await api('/api/admin/demo-seed', { method: 'DELETE' }); toast(`Удалено: ${d.removed}`); });

/* ================= эксплуатация школы V8 ================= */
route('/maintenance',async()=>{
  const [items,rooms]=await Promise.all([api('/api/maintenance'),api('/api/rooms')]);const manager=['admin','director'].includes(S.user.role);
  return {title:'Обслуживание',html:html`${head({title:'Плановые осмотры',sub:'Профилактика и контроль выполнения работ.'})}
    ${manager&&html`<section class="panel"><h2>Запланировать осмотр</h2><form class="pb form-flex" data-form="maintenanceAdd"><label>Кабинет<select class="select" id="mt-room">${rooms.map(r=>html`<option value="${r.id}">${r.number}</option>`)}</select></label><label>Задача<input class="input" id="mt-title" minlength="3" maxlength="200" required placeholder="Проверить освещение"></label><label>Дата<input class="input" type="date" id="mt-date" required></label><button class="btn">Запланировать</button></form></section>`}
    <section class="panel"><h2>План работ</h2><div class="rows">${items.length?items.map(x=>html`<div class="row mt-row"><div><b>${x.title}</b><div class="muted sm">Кабинет ${x.room} · ${x.due_at.slice(0,10)}</div></div>${x.done_at?html`<span class="ai-ok">Выполнено</span>`:S.user.role!=='director'?html`<button class="btn alt sm" data-act="maintenanceDone" data-id="${x.id}">Отметить выполненным</button>`:html`<span class="muted">Запланировано</span>`}</div>`):empty('Пока нет задач','Запланируйте первый осмотр.')}</div></section>`};
},{roles:['worker','admin','director']});
FORM.maintenanceAdd=()=>mutate(()=>api('/api/admin/maintenance',{method:'POST',body:{room_id:+$('#mt-room').value,title:$('#mt-title').value,due_at:$('#mt-date').value}}),'Осмотр запланирован');
ACT.maintenanceDone=el=>mutate(()=>api(`/api/maintenance/${el.dataset.id}/done`,{method:'PATCH'}),'Осмотр выполнен');
route('/passports',async()=>{
  const rooms=await api('/api/rooms');return {title:'Паспорта',html:html`${head({title:'Паспорта кабинетов',sub:'Оборудование, история неисправностей и состояние помещений.'})}<section class="panel"><h2>Выберите кабинет</h2><div class="passport-grid">${rooms.map(r=>html`<a href="#/passport/${r.id}" class="passport-tile">${plate(r.number)}<span class="muted sm">${r.floor} этаж · ${r.active} активных</span></a>`)}</div></section>`};
});
route('/passport/:id',async({id})=>{
  const d=await api(`/api/rooms/${id}/passport`),manager=['admin','director'].includes(S.user.role);
  return {title:'Кабинет '+d.room.number,html:html`${head({crumb:html`<a href="#/passports">Все кабинеты</a>`,title:'Паспорт кабинета '+d.room.number,sub:d.room.floor+' этаж'})}
  ${manager&&html`<section class="panel"><h2>Добавить оборудование</h2><form class="pb form-flex" data-form="equipmentAdd" data-id="${id}"><label>Название<input class="input" id="eq-name" minlength="2" required maxlength="120"></label><label>Описание<input class="input" id="eq-details" maxlength="500"></label><label>Состояние<select class="select" id="eq-state"><option value="ok">Исправно</option><option value="attention">Проверить</option><option value="broken">Неисправно</option></select></label><button class="btn">Добавить</button></form></section>`}
  <section class="panel"><h2>Оборудование</h2><div class="rows">${d.equipment.length?d.equipment.map(x=>html`<div class="row"><b>${x.name}</b><span class="muted sm">${x.details}</span><span>${{ok:'Исправно',attention:'Проверить',broken:'Неисправно'}[x.condition]||x.condition}</span></div>`):empty('Оборудование не добавлено','Добавьте первое устройство или элемент помещения.')}</div></section>
  <section class="panel"><h2>История кабинета</h2><div class="rows">${d.recent.length?d.recent.map(x=>html`<a class="row" href="#/request/${x.id}"><b>#${x.id}</b><span>${x.description||'Без описания'}</span>${statusPill(x.status)}</a>`):empty('Нет заявок','Здесь появится история обслуживания.')}</div></section>`};
});
FORM.equipmentAdd=f=>mutate(()=>api('/api/admin/equipment',{method:'POST',body:{room_id:+f.dataset.id,name:$('#eq-name').value,details:$('#eq-details').value,condition:$('#eq-state').value}}),'Оборудование добавлено');
route('/ai-usage',async()=>{
 const d=await api('/api/admin/ai-usage');return {title:'Использование ИИ',html:html`${head({title:'Использование ИИ',sub:'Запросы к модели, результаты и время ответа.'})}<section class="panel"><h2>Анализы</h2><div class="rows">${d.items.length?d.items.map(x=>html`<div class="row"><b>${x.model}</b><span>${x.status}</span><span>${x.requests} запросов</span><span>${x.avg_ms} мс</span></div>`):empty('Пока нет обращений','Статистика появится после анализа фотографий.')}</div><p class="pb muted sm">${d.note}</p></section>`};
},{roles:['admin','director']});

/* ================= уведомления, профиль ================= */
route('/notifications', async () => {
  const n = await api('/api/notifications');
  return {
    title: 'Уведомления', html: html`${head({ title: 'Уведомления', sub: 'Изменения заявок, комментарии и предупреждения по срокам.', actions: n.some(x => !x.read) && html`<button class="btn alt" data-act="readAll">${ic('check')}Прочитать все</button>` })}
    <section class="panel"><div class="rows notification-list">${n.length ? n.map(x => html`<a class="row ${!x.read ? 'notice-new' : ''} ${/опас|критич|обруш|сроч/i.test(x.title+' '+x.body) ? 'notice-urgent' : ''}" style="grid-template-columns:10px 1fr auto" href="${x.request_id ? '#/request/' + x.request_id : '#/notifications'}"><i style="width:8px;height:8px;border-radius:50%;background:${x.read ? 'transparent' : 'var(--chalk)'}"></i><div><div class="t">${x.title}</div><div class="m">${x.body}</div></div><span class="muted sm">${ago(x.created_at)}</span></a>`) : empty('Уведомлений нет', 'Здесь появятся новые события.')}</div></section>`
  };
});
ACT.readAll = () => mutate(() => api('/api/notifications/read', { method: 'PATCH' }));
route('/profile', async () => {
  const d = await api('/api/profile'), st = d.settings, theme = localStorage.getItem('sp_theme') || 'auto';
  return {
    title: 'Профиль', html: html`${head({ title: 'Профиль', sub: `${d.user.name} · ${ROLE[d.user.role]} · ${d.user.login}`, actions: html`<button class="btn alt" data-act="logout">${ic('out')}Выйти</button>` })}
    <div class="grid2" style="grid-template-columns:1fr 1fr"><section class="panel"><h2>Внешний вид и уведомления</h2>
      <div class="settings"><div><b>Тема</b><p>Авто следует настройкам устройства.</p></div><div class="seg">${[['auto', 'Авто'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(([k, l]) => html`<button data-act="setTheme" data-v="${k}" aria-pressed="${String(k === theme)}">${l}</button>`)}</div></div>
      <div class="settings"><div><b>Плотный режим</b><p>Меньше отступов в списках.</p></div><input type="checkbox" id="pf-compact" data-change="pref" ${st.compact ? 'checked' : ''} aria-label="Плотный режим"></div>
      <div class="settings"><div><b>Уведомления о заявках</b><p>Новые заявки, комментарии, сроки.</p></div><input type="checkbox" id="pf-notify" data-change="pref" ${st.notifications ? 'checked' : ''} aria-label="Уведомления"></div></section>
    <section class="panel"><h2>Смена пароля</h2><form class="pb" style="display:grid;gap:14px" data-form="pwd"><div class="fld"><label for="p-old">Текущий пароль</label><input class="input" id="p-old" type="password" autocomplete="current-password" required></div>
      <div class="fld"><label for="p-new">Новый пароль (от 6 символов)</label><input class="input" id="p-new" type="password" autocomplete="new-password" minlength="6" required></div><button class="btn" style="justify-self:start">Обновить пароль</button></form></section></div>`
  };
});
ACT.setTheme = el => { localStorage.setItem('sp_theme', el.dataset.v); applyTheme(); $$('[data-act=setTheme]').forEach(b => b.setAttribute('aria-pressed', String(b === el))); };
ACT.theme = () => { const o = ['auto', 'light', 'dark'], c = localStorage.getItem('sp_theme') || 'auto'; const n = o[(o.indexOf(c) + 1) % 3]; localStorage.setItem('sp_theme', n); applyTheme(); toast('Тема: ' + { auto: 'авто', light: 'светлая', dark: 'тёмная' }[n]); };
ACT.pref = async () => {
  const compact = $('#pf-compact').checked, notifications = $('#pf-notify').checked;
  localStorage.setItem('sp_density', compact ? 'compact' : 'normal'); applyTheme();
  try { await api('/api/profile/settings', { method: 'PATCH', body: { notifications, compact } }); toast('Сохранено'); } catch (e) { toast(e.message, 'err'); }
};
FORM.pwd = async f => { try { await api('/api/profile/password', { method: 'PATCH', body: { old_password: $('#p-old').value, new_password: $('#p-new').value } }); f.reset(); signOut(true); toast('Пароль обновлён. Войдите снова'); } catch (e) { toast(e.message, 'err'); } };

/* ================= сценарий защиты ================= */
route('/demo', async () => {
  const d = await api('/api/demo');
  return {
    title: 'Сценарий защиты', html: html`${head({ title: 'Сценарий защиты', sub: 'Путь заявки от учителя до директора — покажите его жюри за 2–3 минуты. Переключайтесь между ролями одной кнопкой.' })}
    <div class="grid2" style="grid-template-columns:1.2fr 1fr"><section class="panel"><h2>Ход демонстрации</h2><ol class="tl">${d.steps.map(s => html`<li><div><em>${s.role}</em><b>${s.title}</b><span>${s.text}</span></div></li>`)}</ol></section>
    <div class="stack"><section class="panel"><h2>Войти как</h2><div class="pb" style="display:grid;gap:10px"><div class="quick-in">${Object.entries(ROLE).map(([k, v]) => html`<button class="btn ${S.user.role === k ? '' : 'alt'}" data-act="asRole" data-v="${k}">${v}</button>`)}</div><p class="sm muted">Работает для демо-аккаунтов с паролем 1234.</p></div></section>
      <section class="panel"><h2>Что подчеркнуть</h2><div class="rows">${d.principles.map(p => html`<div class="row" style="grid-template-columns:auto 1fr">${ic('check')}<span>${p}</span></div>`)}</div></section>
      ${S.user.role === 'admin' ? html`<section class="panel"><h2>Подготовка</h2><div class="pb"><a class="btn alt" href="#/admin">Добавить демо-данные →</a></div></section>` : ''}</div></div>`
  };
});
ACT.asRole = async el => { try { const d = await api('/api/login', { method: 'POST', body: { login: el.dataset.v, password: '1234' } }); S.pending = '#/demo'; enter(d.token, d.user); } catch (e) { toast('Не удалось войти: ' + e.message, 'err'); } };

/* ================= палитра команд (Ctrl+K) ================= */
const PAL = { items: [], sel: 0, timer: 0 };
function palPages(q) {
  const pages = [...navItems().map(([p, , l]) => ['#' + p, l]), ...(canCreate() ? [['#/new', 'Новая заявка']] : []), ['#/notifications', 'Уведомления'], ['#/profile', 'Профиль и настройки']];
  return pages.filter(([, l]) => l.toLowerCase().includes(q.toLowerCase())).map(([href, label]) => ({ href, label, kind: 'Раздел' }));
}
function palDraw() {
  $('#pal-list').innerHTML = str(PAL.items.length ? PAL.items.map((x, i) => html`<li><a href="${x.href}" class="${i === PAL.sel ? 'sel' : ''}" data-act="closeModal">${x.plate ? plate(x.plate) : ic('search')}<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.label}</span><span class="muted sm">${x.kind}</span></a></li>`) : html`<li class="empty">Ничего не найдено</li>`);
}
ACT.palSearch = el => {
  const q = el.value.trim(); PAL.items = palPages(q); PAL.sel = 0; palDraw(); clearTimeout(PAL.timer);
  if (q.length < 2) return;
  PAL.timer = setTimeout(async () => {
    try { const rows = await api('/api/search?q=' + encodeURIComponent(q)); PAL.items = [...palPages(q), ...rows.slice(0, 8).map(r => ({ href: '#/request/' + r.id, label: `#${r.id} · ${r.description || 'Без описания'}`, kind: STATUS[r.status], plate: r.room }))]; palDraw(); } catch { /* оставим разделы */ }
  }, 220);
};
ACT.palette = () => {
  PAL.items = palPages(''); PAL.sel = 0;
  const d = modal(html`<div class="pal"><input id="pal-in" placeholder="Раздел, номер заявки, кабинет, имя…" data-input="palSearch" autocomplete="off" aria-label="Поиск"><ul id="pal-list"></ul></div>`);
  palDraw(); $('#pal-in').focus();
  $('#pal-in').addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); PAL.sel = (PAL.sel + (e.key === 'ArrowDown' ? 1 : -1) + PAL.items.length) % Math.max(1, PAL.items.length); palDraw(); }
    if (e.key === 'Enter' && PAL.items[PAL.sel]) { location.hash = PAL.items[PAL.sel].href; d.close(); }
  });
};
document.addEventListener('keydown', e => {
  if (!S.user) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) { e.preventDefault(); ACT.palette(); }
});
ACT.logout = () => signOut();

/* Управление кабинетами: доступно администратору */
route('/rooms-settings', async () => {
  const rooms=await api('/api/rooms');
  return { title:'Настройки кабинетов', html:html`${head({title:'Кабинеты и этажи',sub:'Добавляйте помещения на любом этаже. Кабинеты с историей заявок защищены от удаления.'})}
  <section class="panel"><h2>Добавить кабинет</h2><form class="room-form" data-form="roomCreate"><div class="fld"><label for="new-room-number">Номер кабинета</label><input class="input" id="new-room-number" maxlength="20" required placeholder="Например, 501"></div><div class="fld"><label for="new-room-floor">Этаж</label><input class="input" id="new-room-floor" type="number" min="-5" max="100" required value="1"></div><button class="btn">Добавить</button></form></section>
  <section class="panel"><h2>Все кабинеты (${rooms.length})</h2><div class="rows">${rooms.map(r=>html`<div class="row room-setting-row">${plate(r.number)}<span>${r.floor} этаж · ${r.total} заявок</span><button class="btn ghost sm" data-act="removeRoom" data-id="${r.id}" ${r.total ? 'disabled' : ''}>Удалить</button></div>`)}</div></section>`};
},{roles:['admin']});
FORM.roomCreate = f => mutate(()=>api('/api/admin/rooms',{method:'POST',body:{number:$('#new-room-number').value.trim(),floor:Number($('#new-room-floor').value)}}),'Кабинет добавлен');
ACT.removeRoom = el => {if(confirm('Удалить этот кабинет?')) mutate(()=>api('/api/admin/rooms/'+el.dataset.id,{method:'DELETE'}),'Кабинет удалён');};
