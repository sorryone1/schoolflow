'use strict';
applyTheme();
const startParams = new URLSearchParams(location.search);
if (startParams.get('room')) { S.pending = '#/new?room=' + encodeURIComponent(startParams.get('room')); history.replaceState(null, '', location.pathname); }
window.addEventListener('hashchange', navigate);
(async () => {
  if (S.token) { try { S.user = await api('/api/me'); sessionStorage.setItem('sp_user', JSON.stringify(S.user)); } catch { /* signOut уже вызван при 401 */ } }
  if (S.user && S.pending) { const t = S.pending; S.pending = null; if (location.hash !== t) { location.hash = t; return; } }
  if (!S.user && !location.hash.startsWith('#/register')) { if (location.hash !== '#/login') { location.hash = '#/login'; return; } }
  navigate();
})();
setInterval(tickSla, 30000);
setInterval(refreshBadge, 30000);
// Главная обновляется сама (новые задачи у работников), не мигая и не сбивая прокрутку
setInterval(async () => {
  if (!S.user || document.hidden || document.querySelector('dialog[open]') || !['', '#/'].includes(location.hash)) return;
  window.__silent = window.__keepScroll = true;
  try { await navigate(); } finally { window.__silent = window.__keepScroll = false; }
}, 45000);
