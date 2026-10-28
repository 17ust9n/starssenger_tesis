/* ================= TRANSPORTE MQTT / TIEMPO REAL ================= */

let client = null;

function startNet() {
  let CID = localStorage.getItem('sp_cid');
  if (!CID) {
    CID = 'sp_' + Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
    try { localStorage.setItem('sp_cid', CID); } catch (e) {}
  }

  // Conexión al Broker MQTT seguro vía WebSockets
  client = mqtt.connect('wss://broker.emqx.io:8084/mqtt', {
    clientId: CID,
    clean: false,
    keepalive: 30,
    reconnectPeriod: 2000
  });

  client.on('connect', () => {
    const dot = document.getElementById('dot');
    if (dot) dot.classList.add('on');

    if (typeof topicMap !== 'undefined') {
      Object.keys(topicMap).forEach(t => client.subscribe(t, { qos: 1 }));
    }

    if (typeof ensureIdentity === 'function') {
      ensureIdentity().then(() => {
        if (typeof topicMap !== 'undefined') {
          Object.keys(topicMap).forEach(t => announcePK(t));
        }
      });
    }

    if (typeof announcePushAll === 'function') announcePushAll();
    if (typeof initPush === 'function') initPush();
  });

  client.on('message', (t, p) => {
    let m;
    try { m = JSON.parse(p.toString()); } catch (e) { return; }

    if (m.from === ME) return;

    // Señalización de llamada WebRTC activa
    if (typeof callRoom !== 'undefined' && callRoom && t === callRoom) {
      if (typeof vsig === 'function') vsig(m);
      return;
    }

    const conv = typeof topicMap !== 'undefined' ? topicMap[t] : null;
    if (!conv) return;

    // --- 1. MENSAJE DE TEXTO ---
    if (m.t === 'msg') {
      const key = typeof keyIn === 'function' ? keyIn(conv.members, m.from, m.k) : null;
      const text = typeof dec === 'function' ? dec(m.ct, key, m.off) : m.ct;

      if (typeof pushMsg === 'function') {
        pushMsg(conv, { id: m.id, from: m.from, text, mine: false, ts: Date.now(), bytes: m.ct.length });
      }

      try {
        if (client) {
          client.publish(conv.topic, JSON.stringify({
            from: ME,
            t: 'ack',
            id: m.id,
            st: (conv === cur && !document.hidden) ? 'read' : 'delivered'
          }));
        }
      } catch (e) {}

      if (typeof addKeys === 'function') addKeys(conv, m.ct.length);
      if (typeof cur !== 'undefined' && conv !== cur) { conv.unread++; }

      if (typeof renderList === 'function') renderList();
      if (typeof avisarMensaje === 'function') avisarMensaje(typeof nameFor === 'function' ? nameFor(m.from) : m.from, text);

      // Respaldo en Django
      syncMessageToDjango(m.id, m.from, m.ct, 'Texto', m.ct.length);

    // --- 2. MENSAJE DE VOZ ---
    } else if (m.t === 'audio') {
      const key = typeof keyIn === 'function' ? keyIn(conv.members, m.from, m.k) : null;
      const raw = typeof decBytes === 'function' && typeof b64ToBytes === 'function' ? decBytes(b64ToBytes(m.b64), key, m.off) : new Uint8Array();
      const url = URL.createObjectURL(new Blob([raw], { type: m.mime || 'audio/webm' }));

      if (typeof pushMsg === 'function') {
        pushMsg(conv, { id: m.id, from: m.from, audio: url, dur: m.dur, rate: m.rate, mine: false, ts: Date.now(), bytes: raw.length });
      }

      try {
        if (client) {
          client.publish(conv.topic, JSON.stringify({
            from: ME,
            t: 'ack',
            id: m.id,
            st: (conv === cur && !document.hidden) ? 'read' : 'delivered'
          }));
        }
      } catch (e) {}

      if (typeof addKeys === 'function') addKeys(conv, raw.length, m.rate);
      if (typeof cur !== 'undefined' && conv !== cur) { conv.unread++; }

      if (typeof renderList === 'function') renderList();
      if (typeof avisarMensaje === 'function') avisarMensaje(typeof nameFor === 'function' ? nameFor(m.from) : m.from, '🎤 Mensaje de voz');

      syncMessageToDjango(m.id, m.from, '[Audio Cifrado]', 'Audio', raw.length);

    // --- 3. IMAGEN / FOTO ---
    } else if (m.t === 'img') {
      const key = typeof keyIn === 'function' ? keyIn(conv.members, m.from, m.k) : null;
      const raw = typeof decBytes === 'function' && typeof b64ToBytes === 'function' ? decBytes(b64ToBytes(m.b64), key, m.off) : new Uint8Array();
      const url = URL.createObjectURL(new Blob([raw], { type: m.mime || 'image/jpeg' }));

      if (typeof pushMsg === 'function') {
        pushMsg(conv, { id: m.id, from: m.from, img: url, mine: false, ts: Date.now(), bytes: raw.length });
      }

      try {
        if (client) {
          client.publish(conv.topic, JSON.stringify({
            from: ME,
            t: 'ack',
            id: m.id,
            st: (conv === cur && !document.hidden) ? 'read' : 'delivered'
          }));
        }
      } catch (e) {}

      if (typeof addKeys === 'function') addKeys(conv, raw.length);
      if (typeof cur !== 'undefined' && conv !== cur) { conv.unread++; }

      if (typeof renderList === 'function') renderList();
      if (typeof avisarMensaje === 'function') avisarMensaje(typeof nameFor === 'function' ? nameFor(m.from) : m.from, '📷 Foto');

      syncMessageToDjango(m.id, m.from, '[Imagen Cifrada]', 'Imagen', raw.length);

    // --- 4. OTROS EVENTOS DEL PROTOCOLO ---
    } else if (m.t === 'push') {
      if (m.sub && typeof peerPush !== 'undefined') peerPush[m.from] = m.sub;
      if (m.since && typeof peerSince !== 'undefined') peerSince[m.from] = m.since;
      if (m.nm && typeof callNames !== 'undefined') callNames[m.from] = m.nm;

    } else if (m.t === 'del') {
      if (typeof removeMsgById === 'function') removeMsgById(conv, m.id);

    } else if (m.t === 'edit') {
      try {
        const key = typeof keyIn === 'function' ? keyIn(conv.members, m.from, m.k) : null;
        if (typeof applyEdit === 'function') applyEdit(conv, m.id, dec(m.ct, key, m.off));
      } catch (e) {}

    } else if (m.t === 'ack') {
      if (typeof ackState === 'function') ackState(conv, m.id, m.st, m.all);

    } else if (m.t === 'pk') {
      const had = typeof peerSS !== 'undefined' ? !!peerSS[m.from] : false;
      if (typeof onPeerPub === 'function') onPeerPub(m.from, m.pub);
      if (!had && client && typeof MY_PUB_B64 !== 'undefined') {
        client.publish(t, JSON.stringify({ from: ME, t: 'pk', pub: MY_PUB_B64 }), { retain: true });
      }

    } else if (m.t === 'invite') {
      if (typeof incomingInvite === 'function') incomingInvite(conv, m);

    } else if (m.t === 'grp') {
      if (m.members && m.name) {
        const others = m.members.filter(x => x !== ME);
        if (others.length >= 2 && !groups.some(g => room([...new Set([ME, ...g.members])]) === room(m.members))) {
          groups.push({ name: m.name, members: others });
          if (typeof saveGroups === 'function') saveGroups();
          if (typeof convForGroup === 'function') convForGroup({ name: m.name, members: others });
          if (typeof renderList === 'function') renderList();
        }
      }

    } else if (m.t === 'invite-cancel') {
      if (m.room && typeof handledRooms !== 'undefined') handledRooms.add(m.room);
      if (typeof stopRing === 'function') stopRing();
      if (typeof pendingCall !== 'undefined' && pendingCall && pendingCall.room === m.room) {
        pendingCall = null;
        const incallEl = document.getElementById('incall');
        if (incallEl) incallEl.style.display = 'none';
      }
    }
  });

  client.on('error', () => {
    const dot = document.getElementById('dot');
    if (dot) dot.classList.remove('on');
  });
}

function syncMessageToDjango(id, from, encryptedContent, category, bytes) {
  fetch('/api/sync-incoming-message/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': typeof getCsrfToken === 'function' ? getCsrfToken() : ''
    },
    body: JSON.stringify({
      id: id,
      from: from,
      encrypted_content: encryptedContent,
      category: category,
      bytes: bytes
    })
  }).catch(() => {});
}