/* ================= CHAT LOGIC / MÓDULO DE MENSAJERÍA ================= */

function fmt(n) {
  return n ? n.toLocaleString('es-AR') : '0';
}

function updateKeyStat() {
  if (typeof cur === 'undefined' || !cur) return;
  const base = cur.type === 'group' ? (cur.members.length + ' miembros · 🔐') : 'cifrado 🔐';
  let s = base + ' · 🔑 ' + fmt(cur.keybits) + ' claves';
  if (cur.rate) s += ' · ' + fmt(cur.rate) + '/s';
  const subEl = document.getElementById('chSub');
  if (subEl) subEl.textContent = s;
}

function addKeys(conv, bytes, rate) {
  conv.keybits += bytes * 8;
  if (rate !== undefined) conv.rate = rate;
  if (typeof cur !== 'undefined' && conv === cur) updateKeyStat();
}

function openChat(conv) {
  cur = conv;
  conv.unread = 0;
  if (typeof askNotif === 'function') askNotif();

  try {
    if (window.client) {
      client.publish(conv.topic, JSON.stringify({ from: ME, t: 'ack', all: 1, st: 'read' }));
    }
  } catch (e) {}

  document.getElementById('chName').textContent = conv.title;
  const av = document.getElementById('chAv');
  av.className = 'av' + (conv.type === 'group' ? ' grp' : '');
  av.textContent = conv.type === 'group' ? '👥' : initials(conv.title);

  updateKeyStat();

  if (typeof ensureIdentity === 'function') {
    ensureIdentity().then(() => {
      if (typeof announcePK === 'function') announcePK(conv.topic);
    });
  }

  renderChat();
  if (typeof show === 'function') show('chatScreen');
  setTimeout(() => {
    const txt = document.getElementById('txt');
    if (txt) txt.focus();
  }, 100);
}

function fmtTime(ts) {
  try {
    const d = new Date(ts), now = new Date();
    const hm = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((t0 - dd) / 86400000);

    if (days <= 0) return hm;
    if (days === 1) return 'ayer ' + hm;
    if (days < 7) return d.toLocaleDateString('es-AR', { weekday: 'long' }) + ' ' + hm;
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' ' + hm;
  } catch (e) {
    return '';
  }
}

function renderChat() {
  const c = document.getElementById('chat');
  if (!c) return;
  c.innerHTML = '';
  if (cur && cur.messages) {
    for (const m of cur.messages) drawMsg(m);
  }
  c.scrollTop = c.scrollHeight;
}

function drawMsg(m) {
  const c = document.getElementById('chat');
  if (!c) return;

  const d = document.createElement('div');
  d.className = 'msg ' + (m.mine ? 'mine' : 'theirs');
  d.dataset.ts = m.ts;
  if (m.id) d.dataset.id = m.id;

  if (!m.mine && cur.type === 'group') {
    const f = document.createElement('div');
    f.className = 'from';
    f.textContent = typeof nameFor === 'function' ? nameFor(m.from) : m.from;
    d.appendChild(f);
  }

  if (m.audio) {
    const lab = document.createElement('div');
    lab.style.fontSize = '12px'; lab.style.marginBottom = '4px';
    lab.textContent = '🎤 Voz' + (m.dur ? (' · ' + m.dur + 's') : '') + (m.rate ? (' · 🔑 ' + fmt(m.rate) + '/s') : '');
    d.appendChild(lab);

    const a = document.createElement('audio');
    a.controls = true; a.src = m.audio; a.style.width = '220px'; a.style.maxWidth = '58vw';
    d.appendChild(a);
  } else if (m.video) {
    const lab = document.createElement('div');
    lab.style.fontSize = '12px'; lab.style.marginBottom = '4px';
    lab.textContent = '🎬 Video';
    d.appendChild(lab);

    const v = document.createElement('video');
    v.controls = true; v.src = m.video; v.playsInline = true;
    v.style.width = '240px'; v.style.maxWidth = '60vw'; v.style.borderRadius = '8px';
    d.appendChild(v);
  } else if (m.img) {
    const im = document.createElement('img');
    im.src = m.img;
    im.style.cssText = 'width:240px;max-width:62vw;border-radius:10px;display:block;cursor:pointer';
    im.onclick = () => { try { window.open(m.img, '_blank'); } catch (e) {} };
    d.appendChild(im);
  } else {
    const bq = document.createElement('span');
    bq.className = 'mbody';
    bq.textContent = m.text;
    d.appendChild(bq);
  }

  // Metadatos: estado editado, hora y tildes de lectura
  const tm = document.createElement('div');
  tm.style.cssText = 'font-size:10px;opacity:.6;margin-top:3px;text-align:right';
  let s = '';
  if (m.edited) s += 'editado · ';
  if (m.ts) { try { s += fmtTime(m.ts); } catch (e) {} }

  const tx = document.createElement('span');
  tx.className = 'mt';
  tx.textContent = s;
  tm.appendChild(tx);

  if (m.mine) {
    const tk = document.createElement('span');
    tk.className = 'tk';
    tk.style.marginLeft = '5px';
    tk.textContent = (!m.state || m.state === 'sent') ? '✓' : '✓✓';
    if (m.state === 'read') {
      const isBw = typeof LS === 'function' ? LS('sp_tickbw') === '1' : false;
      tk.style.color = isBw ? '#04240f' : '#4ea3ff';
    }
    tm.appendChild(tk);
  }
  d.appendChild(tm);

  // Evento pulsación larga o menú contextual para borrar/editar
  let _lp = null;
  const _cancel = () => { if (_lp) { clearTimeout(_lp); _lp = null; } };

  d.addEventListener('pointerdown', () => {
    _lp = setTimeout(() => { _cancel(); showMsgMenu(m, d); }, 500);
  });
  ['pointerup', 'pointerleave', 'pointermove'].forEach(ev => d.addEventListener(ev, _cancel));
  d.addEventListener('contextmenu', ev => { ev.preventDefault(); showMsgMenu(m, d); });

  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}

function sysLine(t) {
  const c = document.getElementById('chat');
  if (!c) return;
  const d = document.createElement('div');
  d.className = 'sys';
  d.textContent = t;
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}

function pushMsg(conv, m) {
  conv.messages.push(m);
  conv.lastTs = m.ts;

  if (typeof SECURE !== 'undefined' && !SECURE && typeof persistMsgs === 'function') {
    persistMsgs(conv);
  }

  if (typeof cur !== 'undefined' && conv === cur) drawMsg(m);

  // Modo Blindado (autoborrado local a los 45s)
  if (typeof SECURE !== 'undefined' && SECURE) {
    setTimeout(() => {
      const i = conv.messages.indexOf(m);
      if (i >= 0) conv.messages.splice(i, 1);
      if (typeof cur !== 'undefined' && conv === cur) {
        const el = document.querySelector('#chat .msg[data-ts="' + m.ts + '"]');
        if (el) el.remove();
      }
    }, 45000);
  }
}

function newMsgId() {
  return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function removeMsgById(conv, id) {
  if (!id) return;
  const i = conv.messages.findIndex(x => x.id === id);
  if (i >= 0) conv.messages.splice(i, 1);
  if (typeof SECURE !== 'undefined' && !SECURE && typeof persistMsgs === 'function') {
    persistMsgs(conv);
  }
  if (typeof cur !== 'undefined' && conv === cur) {
    const el = document.querySelector('#chat .msg[data-id="' + id + '"]');
    if (el) el.remove();
  }
  if (typeof renderList === 'function') renderList();
}

function doDelete(m, el, forAll) {
  if (forAll && m.id && window.client && cur) {
    try {
      client.publish(cur.topic, JSON.stringify({ from: ME, t: 'del', id: m.id }));
    } catch (e) {}

    // Sincronizar eliminación en servidor Django
    fetch('/api/delete-message/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': typeof getCsrfToken === 'function' ? getCsrfToken() : ''
      },
      body: JSON.stringify({ id: m.id, for_all: true })
    }).catch(() => {});
  }

  if (cur) {
    const i = cur.messages.indexOf(m);
    if (i >= 0) cur.messages.splice(i, 1);
    if (typeof SECURE !== 'undefined' && !SECURE && typeof persistMsgs === 'function') {
      persistMsgs(cur);
    }
  }

  if (el && el.remove) el.remove();
  if (typeof renderList === 'function') renderList();
}

let editing = null;

function editMsg(m, el) {
  if (!cur || !m || !m.id) return;
  editing = m;
  const t = document.getElementById('txt');
  t.value = m.text;
  t.focus();
  showEditBanner();
  try { toggleBarBtns(); } catch (e) {}
}

function cancelEdit() {
  editing = null;
  const t = document.getElementById('txt');
  if (t) t.value = '';
  hideEditBanner();
  try { toggleBarBtns(); } catch (e) {}
}

function showEditBanner() {
  let b = document.getElementById('editBanner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'editBanner';
    b.style.cssText = 'padding:7px 14px;background:#143049;border-top:1px solid var(--line);font-size:13px;color:#cfe;display:flex;justify-content:space-between;align-items:center';
    
    const sp = document.createElement('span');
    sp.textContent = '✏️ Editando mensaje — tocá enviar para guardar';
    b.appendChild(sp);

    const x = document.createElement('button');
    x.textContent = '✕';
    x.style.cssText = 'background:none;border:0;color:#9fd;cursor:pointer;font-size:16px;padding:0 4px';
    x.onclick = cancelEdit;
    b.appendChild(x);

    const bar = document.getElementById('txt').parentElement;
    bar.parentElement.insertBefore(b, bar);
  }
  b.style.display = 'flex';
}

function hideEditBanner() {
  const b = document.getElementById('editBanner');
  if (b) b.style.display = 'none';
}

function applyEditSend(m, nt) {
  m.text = nt;
  m.edited = true;
  if (typeof SECURE !== 'undefined' && !SECURE && typeof persistMsgs === 'function') {
    persistMsgs(cur);
  }

  const el = document.querySelector('#chat .msg[data-id="' + m.id + '"]');
  if (el) {
    const b = el.querySelector('.mbody');
    if (b) b.textContent = nt;
    const mt = el.querySelector('.mt');
    if (mt && mt.textContent.indexOf('editado') < 0) mt.textContent = 'editado · ' + mt.textContent;
  }

  const ko = keyOut(cur.members);
  const off = cur.offOut;
  const encText = enc(nt, ko.seed, off);

  try {
    client.publish(cur.topic, JSON.stringify({ from: ME, t: 'edit', id: m.id, ct: encText, off, k: ko.k }));
  } catch (e) {}

  // Actualizar edición en servidor Django
  fetch('/api/edit-message/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': typeof getCsrfToken === 'function' ? getCsrfToken() : ''
    },
    body: JSON.stringify({ id: m.id, encrypted_content: encText })
  }).catch(() => {});

  cur.offOut += typeof utf8bytes === 'function' ? utf8bytes(nt).length : nt.length;
  if (typeof SECURE !== 'undefined' && !SECURE) localStorage.setItem(cur.offKey, cur.offOut);
  if (typeof renderList === 'function') renderList();
}

function applyEdit(conv, id, text) {
  const mm = conv.messages.find(x => x.id === id);
  if (!mm) return;
  mm.text = text;
  mm.edited = true;
  if (typeof SECURE !== 'undefined' && !SECURE && typeof persistMsgs === 'function') {
    persistMsgs(conv);
  }

  if (conv === cur) {
    const el = document.querySelector('#chat .msg[data-id="' + id + '"]');
    if (el) {
      const b = el.querySelector('.mbody');
      if (b) b.textContent = text;
      const mt = el.querySelector('.mt');
      if (mt && mt.textContent.indexOf('editado') < 0) mt.textContent = 'editado · ' + mt.textContent;
    } else {
      renderChat();
    }
  }
  if (typeof renderList === 'function') renderList();
}

function ackState(conv, id, st, all) {
  let ch = false;
  for (const mm of conv.messages) {
    if (!mm.mine) continue;
    if (!all && mm.id !== id) continue;
    if (mm.state === 'read') continue;
    mm.state = (st === 'read') ? 'read' : 'delivered';
    ch = true;

    // Sincronizar tildes con Django
    fetch('/api/update-ack/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': typeof getCsrfToken === 'function' ? getCsrfToken() : ''
      },
      body: JSON.stringify({ id: mm.id, state: mm.state })
    }).catch(() => {});
  }

  if (ch) {
    if (typeof SECURE !== 'undefined' && !SECURE && typeof persistMsgs === 'function') {
      persistMsgs(conv);
    }
    if (conv === cur) {
      for (const mm of conv.messages) {
        if (!mm.mine || !mm.id) continue;
        const tk = document.querySelector('#chat .msg[data-id="' + mm.id + '"] .tk');
        if (tk) {
          tk.textContent = (!mm.state || mm.state === 'sent') ? '✓' : '✓✓';
          if (mm.state === 'read') {
            const isBw = typeof LS === 'function' ? LS('sp_tickbw') === '1' : false;
            tk.style.color = isBw ? '#04240f' : '#4ea3ff';
          }
        }
      }
    }
  }
}

function closeMsgMenu() {
  const e = document.getElementById('msgMenu');
  if (e) e.remove();
}

function showMsgMenu(m, el) {
  closeMsgMenu();
  const mn = document.createElement('div');
  mn.id = 'msgMenu';
  mn.style.cssText = 'position:fixed;z-index:60;background:var(--navy2);border:1px solid var(--line);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.55);overflow:hidden;min-width:200px';

  const mk = (txt, fn) => {
    const b = document.createElement('button');
    b.textContent = txt;
    b.style.cssText = 'display:block;width:100%;text-align:left;background:none;border:0;color:#eaf2f8;padding:14px 16px;font-size:15px;cursor:pointer';
    b.onpointerdown = ev => ev.stopPropagation();
    b.onclick = () => { closeMsgMenu(); fn(); };
    mn.appendChild(b);
  };

  if (m.mine && m.id && typeof m.text === 'string' && !m.img && !m.audio && !m.video) {
    mk('✏️ Editar', () => editMsg(m, el));
  }
  if (m.mine && m.id) mk('🗑️ Borrar para todos', () => doDelete(m, el, true));
  mk('🙈 Borrar para mí', () => doDelete(m, el, false));
  mk('Cancelar', () => {});

  document.body.appendChild(mn);

  const r = el.getBoundingClientRect();
  const mh = mn.offsetHeight || 150;
  let top = r.bottom + 6;
  if (top + mh > window.innerHeight) top = Math.max(8, r.top - mh - 6);
  let left = Math.min(r.left, window.innerWidth - mn.offsetWidth - 8);

  mn.style.top = top + 'px';
  mn.style.left = Math.max(8, left) + 'px';

  setTimeout(() => document.addEventListener('pointerdown', closeMsgMenu, { once: true }), 0);
}

function send() {
  const t = document.getElementById('txt');
  const msg = t.value.trim();

  if (editing) {
    const m = editing;
    editing = null;
    hideEditBanner();
    const nt = msg;
    t.value = '';
    try { toggleBarBtns(); } catch (e) {}
    if (nt && nt !== m.text && cur && window.client) applyEditSend(m, nt);
    return;
  }

  if (!msg || !cur || !window.client) return;

  const nb = typeof utf8bytes === 'function' ? utf8bytes(msg).length : msg.length;
  const ko = keyOut(cur.members);
  const ct = enc(msg, ko.seed, cur.offOut);
  const id = newMsgId();

  pub(cur, { t: 'msg', id, off: cur.offOut, ct, k: ko.k });
  if (typeof sendPush === 'function') {
    sendPush(cur.members, 'Starssenger', '📩 Mensaje de ' + ME, 'sp-msg-' + cur.topic);
  }

  pushMsg(cur, { id, from: ME, text: msg, mine: true, ts: Date.now(), bytes: nb, state: 'sent' });

  cur.offOut += nb;
  if (typeof SECURE !== 'undefined' && !SECURE) localStorage.setItem(cur.offKey, cur.offOut);
  if (typeof addKeys === 'function') addKeys(cur, nb);

  t.value = '';
  toggleBarBtns();
}

function toggleBarBtns() {
  const txt = document.getElementById('txt');
  if (!txt) return;
  const has = txt.value.trim().length > 0;
  const sendBtn = document.getElementById('sendBtn');
  const micBtn = document.getElementById('micBtn');

  if (sendBtn) sendBtn.style.display = has ? 'flex' : 'none';
  if (micBtn) micBtn.style.display = has ? 'none' : 'flex';
}