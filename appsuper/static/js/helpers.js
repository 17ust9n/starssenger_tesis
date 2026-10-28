/* ================= HELPERS Y FUNCIONES AUXILIARES ================= */

function tail(n) {
  if (!n) return '';
  const str = String(n);
  return '…' + str.slice(-4);
}

function initials(name) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
}

function timeStr(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

function room(mem) {
  if (!Array.isArray(mem)) return 'starssenger/0';
  let h = 5381;
  const str = mem.slice().sort().join('|');
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  }
  return 'starssenger/' + h.toString(36);
}

function nameFor(num) {
  if (typeof contacts !== 'undefined' && Array.isArray(contacts)) {
    const c = contacts.find(item => item.number === num);
    if (c) return c.name;
  }
  return tail(num);
}

function dispName(num) {
  return nameFor(num);
}

function saveContacts() {
  try {
    // Los contactos SIEMPRE se guardan localmente (aún en Modo Blindado)
    localStorage.setItem('sp_contacts', JSON.stringify(contacts));
  } catch (e) {}
}

function saveGroups() {
  try {
    localStorage.setItem('sp_groups', JSON.stringify(groups));
  } catch (e) {}
}

function persistMsgs(conv) {
  // Solo se persisten los mensajes si NO está activado el Modo Blindado
  if (typeof SECURE !== 'undefined' && !SECURE && conv && conv.topic) {
    try {
      // Filtrar blobs de audio o medios grandes para optimizar el almacenamiento local
      const textMsgs = conv.messages.filter(m => !m.audio);
      localStorage.setItem('sp_msgs_' + conv.topic, JSON.stringify(textMsgs));
    } catch (e) {}
  }
}