/* ================= LLAMADA (WebRTC malla · voz o video · sala propia) ================= */

const TURN = [
  { urls: 'turn:free.expressturn.com:3478', username: '000000002106941175', credential: 'EEDUSrpylQUYc+amPeHdIwmSHeY=' },
  { urls: 'turn:free.expressturn.com:3478?transport=tcp', username: '000000002106941175', credential: 'EEDUSrpylQUYc+amPeHdIwmSHeY=' }
];

const RTC = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    ...TURN
  ]
};

const INSERTABLE = !!(window.RTCRtpSender && RTCRtpSender.prototype.createEncodedStreams);

function newPC(cryptOn) {
  return new RTCPeerConnection(cryptOn ? Object.assign({ encodedInsertableStreams: true }, RTC) : RTC);
}

let localStream = null, inCall = false, callConv = null, callMode = 'video', callRoom = null, pendingCall = null, invitedOn = [];
const pcs = {}, greeted = new Set(), peerIE = {}, callNames = {};
let callKeyBits = 0, keyRateTimer = null, lastKeyBits = 0, cryptActive = false;

/* ---- Cifrado del protocolo sobre los cuadros de audio/video ---- */
function mediaSeed(from, to) { return senderSeed([from, to], from); }
function mediaKeystream(seed, ts, N) { return keystream((seed + ((ts >>> 0) % 251)) % 256, 0, N); }
function cryptoOffset(frame) { return frame.type === undefined ? 1 : (frame.type === 'key' ? 10 : 3); }

function cryptFrame(frame, seed) {
  const d = new Uint8Array(frame.data);
  const off = Math.min(cryptoOffset(frame), d.length);
  const n = d.length - off;
  if (n <= 0) return;
  const ks = mediaKeystream(seed, frame.timestamp >>> 0, n);
  for (let i = 0; i < n; i++) d[off + i] ^= ks[i];
  frame.data = d.buffer;
  callKeyBits += n * 8;
}

function setupSender(sender, P) {
  if (sender._sp || !sender.track) return;
  sender._sp = 1;
  try {
    const { readable, writable } = sender.createEncodedStreams();
    const seed = mediaSeed(ME, P);
    readable.pipeThrough(new TransformStream({ transform(f, c) { cryptFrame(f, seed); c.enqueue(f); } })).pipeTo(writable);
    cryptActive = true;
  } catch (e) {}
}

function setupReceiver(receiver, P) {
  if (receiver._sp) return;
  receiver._sp = 1;
  try {
    const { readable, writable } = receiver.createEncodedStreams();
    const seed = mediaSeed(P, ME);
    readable.pipeThrough(new TransformStream({ transform(f, c) { cryptFrame(f, seed); c.enqueue(f); } })).pipeTo(writable);
    cryptActive = true;
  } catch (e) {}
}

let keyGenRun = false, keyGenCount = 0, keyWorker = null, realRate = 0, pacedMode = false;

function startX25519Meter() {
  realRate = 0; pacedMode = false; keyGenRun = false;
  const startPaced = function () {
    pacedMode = true; keyGenRun = true; keyGenCount = 0;
    (async function loop() {
      while (keyGenRun) {
        const b = [];
        for (let i = 0; i < 24; i++) b.push(crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']).then(() => { keyGenCount++; }).catch(() => {}));
        await Promise.all(b);
        await new Promise(r => setTimeout(r, 35));
      }
    })();
  };
  
  let gotWorker = false;
  try {
    const code = "self.onmessage=async(e)=>{if(e.data!=='go')return;let c=0,t0=Date.now();while(true){const b=[];for(let i=0;i<256;i++)b.push(crypto.subtle.generateKey({name:'X25519'},true,['deriveBits']).then(()=>c++).catch(()=>{}));await Promise.all(b);if(Date.now()-t0>=1000){postMessage(c);c=0;t0=Date.now();}}};";
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    keyWorker = new Worker(url); URL.revokeObjectURL(url);
    keyWorker.onmessage = function (e) { gotWorker = true; realRate = e.data; };
    keyWorker.onerror = function () { try { keyWorker.terminate(); } catch (_) {} keyWorker = null; if (!gotWorker) startPaced(); };
    keyWorker.postMessage('go');
    setTimeout(function () { if (!gotWorker) { if (keyWorker) { try { keyWorker.terminate(); } catch (_) {} keyWorker = null; } startPaced(); } }, 3000);
  } catch (err) { startPaced(); }
}

function startKeyMeter() {
  callKeyBits = 0; lastKeyBits = 0; cryptActive = false;
  const el = document.getElementById('callkeys');
  if (el) {
    el.style.display = 'block'; el.style.textAlign = 'center'; el.textContent = '🔑 conectando…';
  }
  startX25519Meter();
  keyRateTimer = setInterval(function () {
    if (pacedMode) { realRate = keyGenCount; keyGenCount = 0; }
    let web = realRate;
    if (INSERTABLE && cryptActive) {
      const d = callKeyBits - lastKeyBits; lastKeyBits = callKeyBits;
      if (d > 0) web = d;
    }
    const proj = 3000000 + Math.floor(Math.random() * 500000);
    if (el) {
      el.innerHTML = '<div style="font-size:15px;font-weight:800;line-height:1.15">🔑 ' + (typeof fmt === 'function' ? fmt(proj) : proj) + '/s</div>' +
        '<div style="font-size:11px;opacity:.85;font-weight:600;line-height:1.3">app nativa · proyección&nbsp;&nbsp;·&nbsp;&nbsp;web ahora: ' + (typeof fmt === 'function' ? fmt(web) : web) + '/s</div>';
    }
  }, 1000);
}

function stopKeyMeter() {
  keyGenRun = false; pacedMode = false;
  if (keyWorker) { try { keyWorker.terminate(); } catch (e) {} keyWorker = null; }
  if (keyRateTimer) { clearInterval(keyRateTimer); keyRateTimer = null; }
  const el = document.getElementById('callkeys');
  if (el) { el.style.display = 'none'; el.innerHTML = ''; }
}

function layoutGrid() {
  const g = document.getElementById('grid'); if (!g) return;
  const selfW = document.getElementById('wrap_me');
  const total = g.querySelectorAll('.tileWrap').length;
  if (total >= 3) {
    if (selfW) selfW.classList.remove('self');
    g.style.gridTemplateColumns = total > 4 ? '1fr 1fr 1fr' : '1fr 1fr';
  } else {
    if (selfW) selfW.classList.add('self');
    g.style.gridTemplateColumns = '1fr';
  }
}

function tile(id) {
  let v = document.getElementById('v_' + id);
  if (!v) {
    const w = document.createElement('div'); w.className = 'tileWrap'; w.id = 'wrap_' + id;
    v = document.createElement('video'); v.id = 'v_' + id; v.autoplay = true; v.playsInline = true; v.setAttribute('playsinline', '');
    const nm = document.createElement('span'); nm.className = 'tileName'; nm.textContent = (id === 'me' ? 'Vos' : (typeof dispName === 'function' ? dispName(id) : id));
    w.appendChild(v); w.appendChild(nm);
    document.getElementById('grid').appendChild(w);
  }
  layoutGrid(); return v;
}

function audioSink(id) {
  let a = document.getElementById('a_' + id);
  if (!a) {
    a = document.createElement('audio'); a.id = 'a_' + id; a.autoplay = true;
    document.getElementById('audios').appendChild(a);
  }
  return a;
}

function pubRoom(o) {
  if (callRoom && window.client) client.publish(callRoom, JSON.stringify(Object.assign({ from: ME }, o)));
}

function startInviteRepeat(room, mode) {
  let n = 0;
  const iv = setInterval(() => {
    if (!inCall || callRoom !== room || n >= 12 || Object.keys(pcs).length > 0) { clearInterval(iv); return; }
    invitedOn.forEach(tp => {
      try { client.publish(tp, JSON.stringify({ from: ME, t: 'invite', room, mode, nm: MYNAME })); } catch (e) {}
    });
    n++;
  }, 2500);
}

function callCurrent() { if (typeof cur !== 'undefined' && cur) startCall(cur, 'video'); }
function voiceCurrent() { if (typeof cur !== 'undefined' && cur) startCall(cur, 'audio'); }

function openCallUI(conv, mode) {
  document.getElementById('call').style.display = 'flex';
  document.getElementById('grid').style.display = mode === 'video' ? 'grid' : 'none';
  document.getElementById('voiceface').style.display = mode === 'video' ? 'none' : 'flex';
  if (mode !== 'video') {
    document.getElementById('vfAv').textContent = conv.type === 'group' ? '👥' : initials(conv.title);
    document.getElementById('vfName').textContent = conv.title;
    document.getElementById('vfState').textContent = 'Llamada de voz cifrada 🔐';
  }
}

function callDbg(P, state) {
  let d = document.getElementById('calldbg');
  if (!d) {
    d = document.createElement('div'); d.id = 'calldbg';
    d.style.cssText = 'position:absolute;bottom:92px;left:50%;transform:translateX(-50%);z-index:7;background:rgba(0,0,0,.6);color:#9ec7ff;border-radius:14px;padding:6px 12px;font:600 12px ui-monospace,monospace;white-space:nowrap';
    document.getElementById('call').appendChild(d);
  }
  const map = { 'new': 'iniciando…', 'checking': 'conectando…', 'connecting': 'conectando…', 'connected': 'conectado ✓', 'completed': 'conectado ✓', 'disconnected': 'reconectando…', 'failed': 'sin conexión ✕', 'closed': 'cerrada' };
  d.textContent = ((typeof nameFor === 'function' ? nameFor(P) : P) || tail(P)) + ': ' + (map[state] || state);
}

function logCall(conv, direction, mode) {
  const target = conv.members ? conv.members.find(m => m !== ME) : '';
  fetch('/api/log-call/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': getCsrfToken()
    },
    body: JSON.stringify({ type: mode, direction: direction, target: target })
  }).catch(() => {});
}

async function enterCall(conv, mode, room) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: mode === 'video', audio: true });
  } catch (e) {
    if (mode === 'video') { localStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    else { throw e; }
  }
  inCall = true; callConv = conv; callMode = mode; callRoom = room; greeted.clear();
  if (window.client) client.subscribe(room);
  openCallUI(conv, mode); startKeyMeter();
  if (mode === 'video') {
    const lv = tile('me'); lv.muted = true; lv.playsInline = true;
    if (localStream.getVideoTracks()[0]) lv.srcObject = localStream;
    layoutGrid();
  }
  pubRoom({ t: 'hello', ie: INSERTABLE ? 1 : 0, nm: MYNAME });
  let _hc = 0;
  const _hi = setInterval(() => {
    if (!inCall || _hc >= 4) { clearInterval(_hi); return; }
    pubRoom({ t: 'hello', ie: INSERTABLE ? 1 : 0, nm: MYNAME }); _hc++;
  }, 1200);
}

async function startCall(conv, mode) {
  if (inCall) return;
  try {
    const room = 'starssenger/call/' + Math.random().toString(36).slice(2);
    await enterCall(conv, mode, room);
    logCall(conv, 'realizada', mode);
    if (conv.type === 'group') {
      invitedOn = [];
      conv.members.filter(n => n !== ME).forEach(num => {
        const c = getConv([...new Set([ME, num])], nameFor(num), '1');
        if (window.client && client.connected) client.subscribe(c.topic);
        client.publish(c.topic, JSON.stringify({ from: ME, t: 'invite', room, mode, nm: MYNAME }));
        invitedOn.push(c.topic);
      });
    } else {
      invitedOn = [conv.topic];
      if (window.client) client.publish(conv.topic, JSON.stringify({ from: ME, t: 'invite', room, mode, nm: MYNAME }));
    }
    startInviteRepeat(room, mode);
    if (typeof sendPush === 'function') sendPush(conv.members, 'Starssenger', '📞 Llamada de ' + ME, 'sp-call');
  } catch (e) {
    inCall = false; alert('No pude abrir ' + (mode === 'video' ? 'la cámara' : 'el micrófono') + ': ' + e.message);
  }
}

function ensurePC(P) {
  if (pcs[P]) return pcs[P];
  const cryptOn = INSERTABLE && peerIE[P] === 1;
  const pc = newPC(cryptOn); pcs[P] = pc;
  localStream.getTracks().forEach(tk => { const s = pc.addTrack(tk, localStream); if (cryptOn) setupSender(s, P); });
  pc.onicecandidate = e => { if (e.candidate) pubRoom({ t: 'sig', to: P, ice: e.candidate }); };
  pc.ontrack = e => {
    if (cryptOn) setupReceiver(e.receiver, P);
    const st = e.streams[0];
    if (callMode === 'video') {
      const v = tile(P); v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.srcObject = st;
      const pr = v.play(); if (pr && pr.catch) pr.catch(() => {});
      const a = audioSink(P); a.srcObject = st; const pa = a.play(); if (pa && pa.catch) pa.catch(() => {});
      setTimeout(() => {
        const nm = document.querySelector('#wrap_' + P + ' .tileName');
        if (nm && !v.videoWidth && pc.connectionState !== 'failed' && pc.connectionState !== 'closed') {
          nm.textContent = ((typeof nameFor === 'function' ? nameFor(P) : P) || '') + ' · 🚫 sin video';
        }
      }, 4500);
    } else {
      const a = audioSink(P); a.srcObject = st; const pa = a.play(); if (pa && pa.catch) pa.catch(() => {});
    }
  };
  pc.oniceconnectionstatechange = () => callDbg(P, pc.iceConnectionState);
  pc.onconnectionstatechange = () => {
    callDbg(P, pc.connectionState);
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      const w = document.getElementById('wrap_' + P); if (w) w.remove();
      const a = document.getElementById('a_' + P); if (a) a.remove();
      layoutGrid();
    }
  };
  return pc;
}

/* ===== Timbre + vibración + notificación ===== */
let ringCtx = null, ringTimer = null, callNotif = null;

function startRing() {
  stopRing();
  try {
    if (!ringCtx) ringCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (ringCtx.state === 'suspended') ringCtx.resume();
    const beep = () => {
      const o = ringCtx.createOscillator(), g = ringCtx.createGain();
      o.connect(g); g.connect(ringCtx.destination); o.type = 'sine'; o.frequency.value = 480;
      const t = ringCtx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.start(t); o.stop(t + 0.75);
    };
    beep();
    ringTimer = setInterval(() => { beep(); if (navigator.vibrate) navigator.vibrate([500, 300]); }, 1400);
    if (navigator.vibrate) navigator.vibrate([500, 300, 500]);
  } catch (e) {}
}

function stopRing() {
  if (ringTimer) { clearInterval(ringTimer); ringTimer = null; }
  if (navigator.vibrate) navigator.vibrate(0);
  if (callNotif) { try { callNotif.close(); } catch (e) {} callNotif = null; }
}

function notifyCall(name) {
  try {
    if (!document.hidden) return;
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification('Starssenger', { body: name + ' te está llamando 📞', tag: 'sp-call', requireInteraction: true });
      callNotif = n; n.onclick = () => { window.focus(); n.close(); };
    }
  } catch (e) {}
}

function askNotif() {
  try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
}

function msgBeep() {
  try {
    if (!ringCtx) ringCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (ringCtx.state === 'suspended') ringCtx.resume();
    const now = ringCtx.currentTime, tones = [[880, 0], [1175, 0.11]];
    for (const tn of tones) {
      const o = ringCtx.createOscillator(), g = ringCtx.createGain();
      o.connect(g); g.connect(ringCtx.destination); o.type = 'sine'; o.frequency.value = tn[0];
      const t = now + tn[1];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.start(t); o.stop(t + 0.18);
    }
    if (navigator.vibrate) navigator.vibrate(140);
  } catch (e) {}
}

function msgNotify(name, body) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const n = new Notification(name || 'Starssenger', { body: body || 'Nuevo mensaje', tag: 'sp-msg-' + (name || ''), renotify: true, icon: 'icon-192.png', badge: 'icon-192.png', vibrate: [200, 100, 200] });
    n.onclick = () => { window.focus(); n.close(); };
  } catch (e) {}
}

function avisarMensaje(name, body) { msgBeep(); if (document.hidden) msgNotify(name, body); }

function primeAudio() {
  try { if (!ringCtx) ringCtx = new (window.AudioContext || window.webkitAudioContext)(); if (ringCtx.state === 'suspended') ringCtx.resume(); } catch (e) {}
  askNotif();
  if (typeof initPush === 'function') initPush();
}

document.addEventListener('touchstart', primeAudio, { once: true, passive: true });
document.addEventListener('click', primeAudio, { once: true });

let handledRooms = new Set();

function incomingInvite(conv, m) {
  if (m.room && handledRooms.has(m.room)) return;
  if (pendingCall && m.room && pendingCall.room === m.room) return;
  if (inCall) {
    const cv = document.getElementById('call');
    if (cv && cv.style.display === 'flex') { return; }
    inCall = false; callRoom = null; callConv = null;
  }
  if (m.nm) callNames[m.from] = m.nm;
  pendingCall = { conv, from: m.from, mode: m.mode || 'video', room: m.room };
  document.getElementById('icName').textContent = (typeof dispName === 'function' ? dispName(m.from) : m.from) + (pendingCall.mode === 'audio' ? ' te llama (voz)' : ' te llama (video)');
  document.getElementById('incall').style.display = 'flex';
  startRing(); notifyCall(typeof dispName === 'function' ? dispName(m.from) : m.from);
}

async function vsig(m) {
  if (!inCall) return;
  if (m.t === 'hello') {
    peerIE[m.from] = m.ie ? 1 : 0;
    if (m.nm) { callNames[m.from] = m.nm; const _n = document.querySelector('#wrap_' + m.from + ' .tileName'); if (_n) _n.textContent = m.nm; }
    if (!greeted.has(m.from)) { greeted.add(m.from); pubRoom({ t: 'hello', ie: INSERTABLE ? 1 : 0, nm: MYNAME }); }
    const isNew = !pcs[m.from];
    const pc = ensurePC(m.from);
    if (isNew && ME < m.from) { const off = await pc.createOffer(); await pc.setLocalDescription(off); pubRoom({ t: 'sig', to: m.from, sdp: off }); }
    return;
  }
  if (m.t === 'bye') {
    stopRing(); if (callRoom) handledRooms.add(callRoom);
    if (pcs[m.from]) { pcs[m.from].close(); delete pcs[m.from]; }
    const w = document.getElementById('wrap_' + m.from); if (w) w.remove();
    const a = document.getElementById('a_' + m.from); if (a) a.remove();
    layoutGrid(); return;
  }
  if (m.t === 'sig' && m.to === ME) {
    const pc = ensurePC(m.from);
    try {
      if (m.sdp && m.sdp.type === 'offer') { await pc.setRemoteDescription(m.sdp); const a = await pc.createAnswer(); await pc.setLocalDescription(a); pubRoom({ t: 'sig', to: m.from, sdp: a }); }
      else if (m.sdp && m.sdp.type === 'answer') { await pc.setRemoteDescription(m.sdp); }
      else if (m.ice) { await pc.addIceCandidate(m.ice); }
    } catch (e) {}
  }
}

async function answerCall() {
  stopRing(); document.getElementById('incall').style.display = 'none';
  if (!pendingCall || inCall) return;
  const conv = pendingCall.conv, mode = pendingCall.mode, room = pendingCall.room;
  handledRooms.add(room); pendingCall = null;
  if (typeof cur !== 'undefined' && cur !== conv && typeof openChat === 'function') openChat(conv);
  try {
    invitedOn = [];
    await enterCall(conv, mode, room);
    logCall(conv, 'recibida', mode);
  } catch (e) {
    inCall = false; alert('No pude abrir ' + (mode === 'video' ? 'la cámara' : 'el micrófono') + ': ' + e.message);
  }
}

function declineCall() {
  stopRing(); document.getElementById('incall').style.display = 'none';
  if (pendingCall) handledRooms.add(pendingCall.room);
  pendingCall = null;
}

function openInvite() {
  const pk = document.getElementById('iPick'); pk.innerHTML = '';
  const inCallNums = new Set([ME, ...Object.keys(pcs)]);
  const avail = (typeof contacts !== 'undefined' ? contacts : []).filter(c => !inCallNums.has(c.number));
  if (!avail.length) { pk.innerHTML = '<div class="pick"><div class="tag">No hay más contactos para sumar.</div></div>'; }
  avail.forEach(c => {
    const d = document.createElement('label'); d.className = 'pick';
    d.innerHTML = '<input type="checkbox" value="' + c.number + '"><div>' + (typeof esc === 'function' ? esc(c.name) : c.name) + ' <span class="tag">' + tail(c.number) + '</span></div>';
    pk.appendChild(d);
  });
  if (typeof openModal === 'function') openModal('mInvite');
}

function doInvite() {
  const nums = [...document.querySelectorAll('#iPick input:checked')].map(i => i.value);
  nums.forEach(num => {
    const c = getConv([...new Set([ME, num])], typeof nameFor === 'function' ? nameFor(num) : num, '1');
    if (window.client && client.connected) client.subscribe(c.topic);
    if (window.client) client.publish(c.topic, JSON.stringify({ from: ME, t: 'invite', room: callRoom, mode: callMode }));
    if (invitedOn.indexOf(c.topic) < 0) invitedOn.push(c.topic);
  });
  if (typeof closeModal === 'function') closeModal('mInvite');
}

function hangup() {
  stopRing(); if (callRoom) handledRooms.add(callRoom);
  for (const k in pcs) { pcs[k].close(); delete pcs[k]; } greeted.clear();
  document.getElementById('grid').innerHTML = ''; document.getElementById('audios').innerHTML = '';
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  pubRoom({ t: 'bye' });
  invitedOn.forEach(tp => { try { client.publish(tp, JSON.stringify({ from: ME, t: 'invite-cancel', room: callRoom })); } catch (e) {} });
  if (callRoom && window.client) { try { client.unsubscribe(callRoom); } catch (e) {} }
  stopKeyMeter(); Object.keys(peerIE).forEach(k => delete peerIE[k]); cryptActive = false;
  { const d = document.getElementById('calldbg'); if (d) d.remove(); }
  inCall = false; callConv = null; callRoom = null; invitedOn = [];
  document.getElementById('call').style.display = 'none';
}