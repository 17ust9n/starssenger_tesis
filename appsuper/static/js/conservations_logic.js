/* ================= CONVERSACIONES Y TÓPICOS ================= */

function getConv(members, title, type) {
  // room() genera la sala/tópico único determinístico derivado de los números ordenados
  const topic = typeof room === 'function' ? room(members) : 'starssenger/room/' + members.slice().sort().join('_');
  
  if (!convs[topic]) {
    const offKey = 'sp_off_' + members.slice().sort().join('_') + '_' + ME;
    
    // Si está en Modo Blindado, el offset es aleatorio y no se guarda en el teléfono
    const isSecure = typeof SECURE !== 'undefined' && SECURE;
    const off = isSecure ? (Math.floor(Math.random() * 1e9) + 1e6) : parseInt((typeof LS === 'function' ? LS(offKey) : localStorage.getItem(offKey)) || '0', 10);
    const msgs = isSecure ? [] : JSON.parse((typeof LS === 'function' ? LS('sp_msgs_' + topic) : localStorage.getItem('sp_msgs_' + topic)) || '[]');
    
    let kb = 0;
    msgs.forEach(m => {
      const bytes = m.bytes || (m.text ? (typeof utf8bytes === 'function' ? utf8bytes(m.text).length : m.text.length) : 0);
      kb += 8 * bytes;
    });

    convs[topic] = {
      topic: topic,
      title: title,
      members: members,
      type: type,
      messages: msgs,
      offOut: off,
      offKey: offKey,
      unread: 0,
      lastTs: msgs.length ? msgs[msgs.length - 1].ts : 0,
      keybits: kb,
      rate: 0
    };

    if (typeof topicMap !== 'undefined') {
      topicMap[topic] = convs[topic];
    }

    if (window.client && client.connected) {
      client.subscribe(topic, { qos: 1 });
    }
  } else {
    convs[topic].title = title;
    convs[topic].members = members;
  }

  return convs[topic];
}

function convForContact(c) {
  if (!c || !c.number) return null;
  const members = [...new Set([ME, c.number])];
  return getConv(members, c.name || c.number, '1');
}

function convForGroup(g) {
  if (!g || !g.members) return null;
  const members = [...new Set([ME, ...g.members])];
  return getConv(members, g.name || 'Grupo', 'group');
}

function rebuildConvs() {
  if (typeof contacts !== 'undefined' && Array.isArray(contacts)) {
    contacts.forEach(convForContact);
  }
  if (typeof groups !== 'undefined' && Array.isArray(groups)) {
    groups.forEach(convForGroup);
  }
}