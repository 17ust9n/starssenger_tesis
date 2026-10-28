/* ================= MODALES Y LÓGICA DE CONTACTOS/GRUPOS ================= */

function openModal(id) {
  document.getElementById(id).classList.add('on');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('on');
}

let editingNum = null;
let infoConv = null;

function openAddContact() {
  editingNum = null;
  document.getElementById('cTitle').textContent = 'Nuevo contacto';
  document.getElementById('cName').value = '';
  document.getElementById('cNum').value = '';
  document.getElementById('cErr').textContent = '';
  document.getElementById('cImport').style.display = 'block';
  document.getElementById('cDel').style.display = 'none';
  openModal('mContact');
}

function openEditContact(c) {
  editingNum = c.number;
  document.getElementById('cTitle').textContent = 'Editar contacto';
  document.getElementById('cName').value = c.name || '';
  document.getElementById('cNum').value = c.number || '';
  document.getElementById('cErr').textContent = '';
  document.getElementById('cImport').style.display = 'none';
  document.getElementById('cDel').style.display = 'block';
  openModal('mContact');
}

function deleteContact() {
  if (!editingNum) return;
  if (!confirm('¿Borrar este contacto?')) return;
  
  contacts = contacts.filter(c => c.number !== editingNum);
  editingNum = null;
  saveContacts();
  closeModal('mContact');
  if (typeof renderNewChat === 'function') renderNewChat();
  if (typeof renderList === 'function') renderList();
}

function openInfoCur() {
  if (typeof cur !== 'undefined' && cur) openInfo(cur);
}

function openInfo(conv) {
  infoConv = conv;
  const av = document.getElementById('iAv');
  av.className = 'av' + (conv.type === 'group' ? ' grp' : '');
  av.textContent = conv.type === 'group' ? '👥' : initials(conv.title);
  
  document.getElementById('iName').textContent = conv.title;
  const mem = document.getElementById('iMembers');
  
  if (conv.type === 'group') {
    document.getElementById('iNum').textContent = conv.members.length + ' miembros';
    mem.innerHTML = '<div class="tag" style="margin:8px 0 2px">Miembros:</div>' +
      conv.members.map(n => '<div class="memrow"><span>' + esc(n === ME ? 'Vos' : nameFor(n)) + '</span><span class="tag">' + tail(n) + '</span></div>').join('');
    document.getElementById('iEditRow').style.display = 'none';
    document.getElementById('iVoice').style.display = 'none';
  } else {
    const num = conv.members.find(n => n !== ME) || '';
    document.getElementById('iNum').textContent = '+' + num;
    const _s = typeof peerSince !== 'undefined' ? peerSince[num] : null;
    mem.innerHTML = _s ? ('<div class="tag" style="margin:10px 0 0">📲 En la app desde ' + new Date(+_s).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + '</div>') : '';
    document.getElementById('iEditRow').style.display = 'flex';
    document.getElementById('iVoice').style.display = '';
  }
  openModal('mInfo');
}

function infoVideo() {
  const c = infoConv;
  closeModal('mInfo');
  if (c && typeof openChat === 'function' && typeof startCall === 'function') {
    openChat(c);
    startCall(c, 'video');
  }
}

function infoVoice() {
  const c = infoConv;
  closeModal('mInfo');
  if (c && typeof openChat === 'function' && typeof startCall === 'function') {
    openChat(c);
    startCall(c, 'audio');
  }
}

function infoEdit() {
  if (!infoConv) return;
  const num = infoConv.members.find(n => n !== ME);
  const c = contacts.find(x => x.number === num) || { name: infoConv.title, number: num };
  closeModal('mInfo');
  openEditContact(c);
}

function infoDelete() {
  if (!infoConv) return;
  const num = infoConv.members.find(n => n !== ME);
  if (confirm('¿Borrar este contacto?')) {
    contacts = contacts.filter(c => c.number !== num);
    saveContacts();
  }
  closeModal('mInfo');
  if (typeof goHome === 'function') goHome();
}

/* ===== BACKUP Y COMPARTIR ===== */

function exportBackup() {
  const data = { v: 1, me: ME, contacts, groups };
  const code = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  try {
    if (navigator.clipboard) navigator.clipboard.writeText(code);
  } catch (e) {}
  prompt('Backup de tus contactos (ya copiado). Guardalo en un mail o nota:', code);
}

function importBackup() {
  const code = prompt('Pegá acá tu backup:');
  if (!code) return;
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    let add = 0;
    (data.contacts || []).forEach(c => {
      if (c && c.number && !contacts.some(x => x.number === c.number)) {
        contacts.push({ name: c.name || c.number, number: c.number });
        add++;
      }
    });
    (data.groups || []).forEach(g => {
      if (g && g.name && !groups.some(x => x.name === g.name)) {
        groups.push(g);
      }
    });
    
    saveContacts();
    saveGroups();

    // Sincronizar masivamente con Django
    fetch('/api/import-backup/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCsrfToken()
      },
      body: JSON.stringify(data)
    });

    alert('✓ Restaurado: ' + add + ' contacto(s). Ya los podés usar.');
    if (typeof goHome === 'function') goHome();
  } catch (e) {
    alert('Ese backup no se pudo leer. Copialo completo, sin cortar.');
  }
}

function shareMyNumber() {
  if (!ME) { alert('Primero poné tu número en Perfil.'); return; }
  const url = location.origin + location.pathname + '?add=' + encodeURIComponent(ME);
  const txt = 'Agregame en Starssenger (mensajería cifrada). Tocá este link y me agregás solo:\n' + url;
  if (navigator.share) {
    navigator.share({ title: 'Starssenger', text: txt }).catch(() => {});
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt)
      .then(() => alert('Link copiado. Pegalo en WhatsApp y mandáselo.'))
      .catch(() => prompt('Copiá y mandá este link:', url));
  } else {
    prompt('Copiá y mandá este link:', url);
  }
}

function processAddLink() {
  try {
    const num = ((new URLSearchParams(location.search)).get('add') || '').replace(/\D/g, '');
    if (num && num.length >= 6 && num !== ME && !contacts.find(c => c.number === num)) {
      openAddContact();
      document.getElementById('cNum').value = num;
      document.getElementById('cImport').style.display = 'none';
      document.getElementById('cErr').textContent = 'Poné un nombre y tocá "Guardar" para agregar este contacto.';
      setTimeout(() => document.getElementById('cName').focus(), 150);
    }
    if (history.replaceState) history.replaceState(null, '', location.origin + location.pathname);
  } catch (e) {}
}

function agendaOk() {
  return ('contacts' in navigator && 'ContactsManager' in window);
}

async function importContact() {
  if (!agendaOk()) {
    alert('Este navegador no puede abrir la agenda. En iPhone no se permite; en Android solo funciona en Chrome.');
    return;
  }
  try {
    const sel = await navigator.contacts.select(['name', 'tel'], { multiple: false });
    if (sel && sel[0]) {
      document.getElementById('cName').value = (sel[0].name && sel[0].name[0]) || '';
      document.getElementById('cNum').value = ((sel[0].tel && sel[0].tel[0]) || '').replace(/\D/g, '');
    }
  } catch (e) {}
}

async function importToNew() {
  if (!agendaOk()) {
    alert('Este navegador no puede abrir la agenda. En iPhone no se permite; en Android solo en Chrome.');
    return;
  }
  try {
    const sel = await navigator.contacts.select(['name', 'tel'], { multiple: true });
    if (!sel || !sel.length) return;
    let add = 0;
    sel.forEach(s => {
      const name = (s.name && s.name[0]) || '';
      const num = ((s.tel && s.tel[0]) || '').replace(/\D/g, '');
      if (!name || num.length < 6 || num === ME) return;
      const ex = contacts.find(c => c.number === num);
      if (ex) { ex.name = name; } else { contacts.push({ name, number: num }); add++; }
    });
    saveContacts();
    if (typeof renderNewChat === 'function') renderNewChat();
    if (typeof renderList === 'function') renderList();
    if (add) alert('Agregué ' + add + ' contacto' + (add > 1 ? 's' : '') + ' de tu agenda.');
  } catch (e) {}
}

function saveContact() {
  const name = document.getElementById('cName').value.trim();
  const num = document.getElementById('cNum').value.replace(/\D/g, '');

  if (!name || num.length < 6) {
    document.getElementById('cErr').textContent = 'Poné nombre y número completo.';
    return;
  }
  if (num === ME) {
    document.getElementById('cErr').textContent = 'Ese es tu propio número.';
    return;
  }

  // Enviar a Django
  const formData = new FormData();
  formData.append('name', name);
  formData.append('phone', num);
  if (editingNum) formData.append('editing_phone', editingNum);

  fetch('/api/save-contact/', {
    method: 'POST',
    headers: { 'X-CSRFToken': getCsrfToken() },
    body: formData
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === 'ok') {
      if (editingNum) {
        const c = contacts.find(c => c.number === editingNum);
        if (c) { c.name = name; c.number = num; } else { contacts.push({ name, number: num }); }
        editingNum = null;
      } else {
        const ex = contacts.find(c => c.number === num);
        if (ex) ex.name = name; else contacts.push({ name, number: num });
      }
      saveContacts();
      closeModal('mContact');
      if (typeof renderNewChat === 'function') renderNewChat();
      if (typeof renderList === 'function') renderList();
    } else {
      document.getElementById('cErr').textContent = data.message || 'Error al guardar.';
    }
  });
}

function openNewGroup() {
  if (contacts.length < 1) {
    alert('Primero agregá algún contacto.');
    return;
  }
  document.getElementById('gName').value = '';
  document.getElementById('gErr').textContent = '';
  const pk = document.getElementById('gPick');
  pk.innerHTML = '';
  contacts.forEach(c => {
    const d = document.createElement('label');
    d.className = 'pick';
    d.innerHTML = '<input type="checkbox" value="' + c.number + '"><div>' + esc(c.name) + ' <span class="tag">' + tail(c.number) + '</span></div>';
    pk.appendChild(d);
  });
  openModal('mGroup');
}

function saveGroup() {
  const name = document.getElementById('gName').value.trim();
  const members = [...document.querySelectorAll('#gPick input:checked')].map(i => i.value);

  if (members.length < 2) {
    document.getElementById('gErr').textContent = 'Elegí al menos 2 miembros.';
    return;
  }

  const full = [...new Set([ME, ...members])];

  fetch('/api/create-group/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': getCsrfToken()
    },
    body: JSON.stringify({ name: name, members: full })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === 'ok') {
      const groupName = data.name;
      if (!groups.some(g => room([...new Set([ME, ...g.members])]) === room(full))) {
        groups.push({ name: groupName, members: full });
        saveGroups();
      }
      if (typeof announceGroup === 'function') announceGroup(full, groupName);
      closeModal('mGroup');
      const g = convForGroup({ name: groupName, members: full });
      if (typeof renderList === 'function') renderList();
      if (typeof openChat === 'function') openChat(g);
    } else {
      document.getElementById('gErr').textContent = data.message || 'Error al crear el grupo.';
    }
  });
}

function addToChat() {
  if (typeof cur === 'undefined' || !cur) return;
  openNewGroup();
  const others = cur.members.filter(n => n !== ME);
  setTimeout(() => {
    document.querySelectorAll('#gPick input').forEach(i => {
      if (others.indexOf(i.value) >= 0) i.checked = true;
    });
    if (cur.type === 'group' && cur.title) {
      const gn = document.getElementById('gName');
      if (gn && !gn.value) gn.value = cur.title;
    }
  }, 0);
}