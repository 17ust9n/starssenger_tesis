/* ================= PANTALLAS Y ENRUTAMIENTO SPA ================= */

const APP_VER = 'v24 · 17-oct';

function show(id) {
  try { if (typeof stopMicSafe === 'function') stopMicSafe(); } catch (e) {}
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
  const el = document.getElementById(id);
  if (el) el.classList.add('on');
}

function goHome() {
  try {
    ['mContact', 'mGroup', 'mInvite', 'mInfo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('on');
    });
  } catch (e) {}
  try {
    if (typeof mediaRec !== 'undefined' && mediaRec && mediaRec.state === 'recording') {
      mediaRec.stop();
    }
  } catch (e) {}
  cur = null;
  show('home');
  renderList();
}

function backToList() {
  goHome();
}

function openNewChat() {
  show('newchat');
  const searchInput = document.getElementById('ncSearch');
  if (searchInput) searchInput.value = '';
  renderNewChat();
}

function openProfile() {
  document.getElementById('pName').textContent = (typeof MYNAME !== 'undefined' && MYNAME) ? MYNAME : tail(ME);
  document.getElementById('pNum').textContent = ME ? ('+' + ME) : '';
  document.getElementById('profAv').textContent = (typeof MYNAME !== 'undefined' && MYNAME) ? initials(MYNAME) : '🙂';
  document.getElementById('pBadge').textContent = (typeof SECURE !== 'undefined' && SECURE) ? '🛡️ Modo Blindado' : '🔓 Modo Normal';

  if (typeof ensureIdentity === 'function') {
    ensureIdentity().then(() => {
      const k = typeof MY_PUB_B64 !== 'undefined' ? MY_PUB_B64 : '';
      const e = document.getElementById('pKey');
      if (e) e.textContent = k ? (k.slice(0, 12) + '…') : '(generando…)';
    });
  }
  show('profile');
}

function openPEdit() {
  document.getElementById('meName2').value = typeof MYNAME !== 'undefined' ? MYNAME : '';
  document.getElementById('setNum').value = ME || '';
  document.getElementById('editAv').textContent = (typeof MYNAME !== 'undefined' && MYNAME) ? initials(MYNAME) : '🙂';
  if (typeof setSec === 'function') setSec(SECURE);

  if (typeof ensureIdentity === 'function') {
    ensureIdentity().then(() => {
      const e = document.getElementById('editKey');
      if (e) e.textContent = (typeof MY_PUB_B64 !== 'undefined' && MY_PUB_B64) ? MY_PUB_B64 : '(generando…)';
    });
  }
  show('pEdit');
}

function openPSettings() {
  const vt = document.getElementById('verTag');
  if (vt) vt.textContent = 'Versión ' + APP_VER;
  const bw = (typeof LS === 'function' ? LS('sp_tickbw') : localStorage.getItem('sp_tickbw')) === '1';
  const a = document.getElementById('tkCol'), b = document.getElementById('tkBw');
  if (a) a.classList.toggle('act', !bw);
  if (b) b.classList.toggle('act', bw);
  show('pSettings');
}

function openPCalls() {
  renderCalls();
  show('pCalls');
}

function openPAbout() {
  const s = document.getElementById('aboutSrv');
  if (s) s.textContent = (window.client && client.connected) ? 'Conectado' : 'Desconectado';
  const v = document.getElementById('aboutVer');
  if (v) v.textContent = 'Versión ' + APP_VER;
  show('pAbout');
}

function openPTerms() {
  show('pTerms');
}

function copyMyKey() {
  if (typeof ensureIdentity === 'function') {
    ensureIdentity().then(() => {
      const k = typeof MY_PUB_B64 !== 'undefined' ? MY_PUB_B64 : '';
      if (!k) return;
      try { navigator.clipboard.writeText(k); } catch (e) {}
      alert('Clave pública copiada.');
    });
  }
}

function renderCalls() {
  const el = document.getElementById('callsBox');
  if (!el) return;
  el.innerHTML = '';

  fetch('/api/get-calls/')
    .then(res => res.json())
    .then(data => {
      const log = data.calls || [];
      if (!log.length) {
        el.innerHTML = '<div class="tag" style="padding:30px 10px;text-align:center">Todavía no hay llamadas.</div>';
        return;
      }
      log.forEach(c => {
        const row = document.createElement('div');
        row.className = 'callrow';
        row.innerHTML = '<div class="cav">' + (c.mode === 'audio' ? '📞' : '🎥') + '</div>' +
          '<div class="cmid"><b>' + esc(c.name) + '</b><div class="cn">' + esc(c.number) + '</div>' +
          '<div class="cd">' + c.ts + ' · ' + (c.mode === 'audio' ? 'Llamada' : 'Videollamada') + ' ' + esc(c.type) + '</div></div>';
        el.appendChild(row);
      });
    })
    .catch(() => {
      el.innerHTML = '<div class="tag" style="padding:30px 10px;text-align:center">Error al cargar el registro.</div>';
    });
}

function setTickColor(bw) {
  try { localStorage.setItem('sp_tickbw', bw ? '1' : '0'); } catch (e) {}
  const a = document.getElementById('tkCol'), b = document.getElementById('tkBw');
  if (a) a.classList.toggle('act', !bw);
  if (b) b.classList.toggle('act', bw);

  fetch('/api/update-preferences/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': typeof getCsrfToken === 'function' ? getCsrfToken() : ''
    },
    body: JSON.stringify({ tick_bw: bw })
  }).catch(() => {});

  try { if (typeof cur !== 'undefined' && cur && typeof renderChat === 'function') renderChat(); } catch (e) {}
}

async function resetApp() {
  if (!confirm('¿Restablecer y actualizar?\nMantiene tu número y contactos. Solo limpia la memoria caché.')) return;
  try {
    if ('serviceWorker' in navigator) {
      const rs = await navigator.serviceWorker.getRegistrations();
      for (const r of rs) { try { await r.unregister(); } catch (e) {} }
    }
  } catch (e) {}
  try {
    if (window.caches) {
      const ks = await caches.keys();
      for (const k of ks) { try { await caches.delete(k); } catch (e) {} }
    }
  } catch (e) {}
  location.reload(true);
}

async function wipeApp() {
  if (!confirm('BORRAR TODO?\nSe elimina tu número, contactos y mensajes de ESTE teléfono.\nNo se puede deshacer.')) return;
  if (!confirm('¿Seguro? La app queda vacía, como nueva.')) return;

  fetch('/api/wipe-user-data/', {
    method: 'POST',
    headers: { 'X-CSRFToken': typeof getCsrfToken === 'function' ? getCsrfToken() : '' }
  }).finally(() => {
    try { localStorage.clear(); } catch (e) {}
    try {
      if (window.caches) {
        caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
      }
    } catch (e) {}
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
      }
    } catch (e) {}
    location.reload(true);
  });
}

function filterHit(name, q) {
  return !q || (name || '').toLowerCase().indexOf(q) >= 0;
}

function renderList() {
  const searchEl = document.getElementById('homeSearch');
  const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const items = [];

  if (typeof contacts !== 'undefined') {
    contacts.forEach(c => { const cv = convForContact(c); items.push({ cv, type: '1' }); });
  }
  if (typeof groups !== 'undefined') {
    groups.forEach(g => { const cv = convForGroup(g); items.push({ cv, type: 'group' }); });
  }

  items.sort((a, b) => b.cv.lastTs - a.cv.lastTs);
  const el = document.getElementById('list');
  if (!el) return;
  el.innerHTML = '';

  if (!items.length) {
    el.innerHTML = '<div class="empty">Todavía no tenés chats.<br>Tocá el lápiz ✏️ de abajo para empezar uno.</div>';
    return;
  }

  const vis = items.filter(it => filterHit(it.cv.title, q));
  if (!vis.length) {
    el.innerHTML = '<div class="empty">Nadie con ese nombre.</div>';
    return;
  }

  for (const { cv, type } of vis) {
    const last = cv.messages[cv.messages.length - 1];
    const body = last ? (last.audio ? '🎤 Mensaje de voz' : (last.img ? '📷 Foto' : last.text)) : '';
    const prev = last ? ((last.mine ? 'Vos: ' : (type === 'group' ? nameFor(last.from) + ': ' : '')) + body) : 'Tocá para chatear o llamar';
    const row = document.createElement('div');
    row.className = 'row';
    row.onclick = () => openChat(cv);

    row.innerHTML = '<div class="av' + (type === 'group' ? ' grp' : '') + '">' + (type === 'group' ? '👥' : initials(cv.title)) + '</div>' +
      '<div class="rmid"><div class="rname">' + esc(cv.title) + '</div><div class="rprev">' + esc(prev) + '</div></div>' +
      '<div class="rright">' + (last ? '<div class="rtime">' + (typeof timeStr === 'function' ? timeStr(last.ts) : '') + '</div>' : '') +
      (cv.unread ? '<div class="badge">' + cv.unread + '</div>' : '') + '</div>';

    el.appendChild(row);
  }
}

function renderNewChat() {
  const searchEl = document.getElementById('ncSearch');
  const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const el = document.getElementById('ncList');
  if (!el) return;
  el.innerHTML = '';

  if (typeof contacts === 'undefined' || !contacts.length) {
    el.innerHTML = '<div class="empty">Todavía no cargaste contactos.<br>Tocá "Agregar contacto nuevo".</div>';
    return;
  }

  const vis = contacts.filter(c => filterHit(c.name, q));
  if (!vis.length) {
    el.innerHTML = '<div class="empty">Nadie con ese nombre.</div>';
    return;
  }

  vis.forEach(c => {
    const cv = convForContact(c);
    const row = document.createElement('div');
    row.className = 'row';
    row.onclick = () => openChat(cv);
    row.innerHTML = '<div class="av">' + initials(c.name) + '</div>' +
      '<div class="rmid"><div class="rname">' + esc(c.name) + '</div><div class="rprev">' + esc(tail(c.number)) + '</div></div>';
    el.appendChild(row);
  });
}

function esc(s) {
  return (s + '').replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}