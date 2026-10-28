/* ===== MENSAJES DE VOZ (grabar + cifrar + enviar) ===== */

let mediaRec = null, recChunks = [], recStart = 0, recStream = null, recCancel = false;

function stopMicSafe() {
  try {
    if (mediaRec && mediaRec.state === 'recording') {
      recCancel = true;
      mediaRec.stop();
    }
  } catch (e) {}
  try {
    if (recStream) {
      recStream.getTracks().forEach(t => t.stop());
      recStream = null;
    }
  } catch (e) {}
  try {
    const mb = document.getElementById('micBtn');
    if (mb) mb.classList.remove('rec');
  } catch (e) {}
}

async function toggleRec() {
  if (mediaRec && mediaRec.state === 'recording') {
    mediaRec.stop();
    return;
  }
  if (typeof cur === 'undefined' || !cur || typeof client === 'undefined' || !client) return;
  
  try {
    recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recChunks = [];
    mediaRec = new MediaRecorder(recStream);
    mediaRec.ondataavailable = e => { if (e.data && e.data.size) recChunks.push(e.data); };
    mediaRec.onstop = finishRec;
    mediaRec.start();
    recStart = Date.now();

    const mb = document.getElementById('micBtn');
    if (mb) mb.classList.add('rec');
    
    const txt = document.getElementById('txt');
    if (txt) txt.placeholder = '🟢 Grabando… tocá el micrófono verde para ENVIAR';
  } catch (e) {
    alert('No pude abrir el micrófono: ' + e.message);
  }
}

async function finishRec() {
  const mb = document.getElementById('micBtn');
  if (mb) mb.classList.remove('rec');
  
  const txt = document.getElementById('txt');
  if (txt) txt.placeholder = 'Mensaje cifrado…';

  if (recCancel) {
    recCancel = false;
    try {
      if (recStream) { recStream.getTracks().forEach(t => t.stop()); recStream = null; }
    } catch (e) {}
    return;
  }

  const secs = Math.max(1, Math.round((Date.now() - recStart) / 1000));
  if (recStream) { recStream.getTracks().forEach(t => t.stop()); recStream = null; }

  const blob = new Blob(recChunks, { type: (mediaRec && mediaRec.mimeType) || 'audio/webm' });
  const buf = new Uint8Array(await blob.arrayBuffer());

  if (!buf.length || typeof cur === 'undefined' || !cur || typeof client === 'undefined' || !client) return;

  const ko = keyOut(cur.members);
  const ctBytes = encBytes(buf, ko.seed, cur.offOut);
  const rate = Math.round(buf.length * 8 / secs);
  const id = newMsgId();

  pub(cur, {
    t: 'audio',
    id: id,
    off: cur.offOut,
    b64: bytesToB64(ctBytes),
    dur: secs,
    mime: blob.type,
    rate: rate,
    k: ko.k
  });

  sendPush(cur.members, 'Starssenger', '🎤 Audio de ' + ME, 'sp-msg-' + cur.topic);

  const url = URL.createObjectURL(blob);
  pushMsg(cur, { id, from: ME, audio: url, dur: secs, rate, mine: true, ts: Date.now(), bytes: buf.length, state: 'sent' });

  cur.offOut += buf.length;
  if (typeof SECURE !== 'undefined' && !SECURE) localStorage.setItem(cur.offKey, cur.offOut);
  if (typeof addKeys === 'function') addKeys(cur, buf.length, rate);
}

/* ===== FOTOS (comprimir + cifrar + enviar) ===== */

function resizeImage(file, maxDim, q) {
  return new Promise((res, rej) => {
    const img = new Image();
    const u = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      if (Math.max(w, h) > maxDim) {
        const s = maxDim / Math.max(w, h);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      try { URL.revokeObjectURL(u); } catch (e) {}
      res(cv.toDataURL('image/jpeg', q));
    };
    img.onerror = () => {
      try { URL.revokeObjectURL(u); } catch (e) {}
      rej(new Error('no se pudo leer la imagen'));
    };
    img.src = u;
  });
}

async function sendImage(file) {
  if (!file || typeof cur === 'undefined' || !cur || typeof client === 'undefined' || !client) return;
  try {
    const dataURL = await resizeImage(file, 1280, 0.7);
    const buf = b64ToBytes(dataURL.split(',')[1]);
    const ko = keyOut(cur.members);
    const ctBytes = encBytes(buf, ko.seed, cur.offOut);
    const id = newMsgId();

    pub(cur, {
      t: 'img',
      id: id,
      off: cur.offOut,
      b64: bytesToB64(ctBytes),
      mime: 'image/jpeg',
      k: ko.k
    });

    sendPush(cur.members, 'Starssenger', '📷 Foto de ' + ME, 'sp-msg-' + cur.topic);

    const url = URL.createObjectURL(new Blob([buf], { type: 'image/jpeg' }));
    pushMsg(cur, { id, from: ME, img: url, mine: true, ts: Date.now(), bytes: buf.length, state: 'sent' });

    cur.offOut += buf.length;
    if (typeof SECURE !== 'undefined' && !SECURE) localStorage.setItem(cur.offKey, cur.offOut);
    if (typeof addKeys === 'function') addKeys(cur, buf.length);
  } catch (e) {
    alert('No pude enviar la foto: ' + e.message);
  }
}

function pub(conv, o) {
  if (client) {
    client.publish(conv.topic, JSON.stringify(Object.assign({ from: ME }, o)), { qos: 1 });
  }
}

/* ===== NOTIFICACIONES PUSH VÍA DJANGO ===== */

const VAPID_PUBLIC = 'BNpov-FXJ4f_HfVIk1j5ydzMqetQZkxLWUEQhUIZvn84hDmQFbls7ZDzVPlb2wxxUBU9ypKWzcTDDYsXCa1iO1A';
let mySub = null;
const peerPush = {};

function u8FromB64url(s) {
  const pad = '='.repeat((4 - s.length % 4) % 4);
  const b = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b);
  const a = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) a[i] = raw.charCodeAt(i);
  return a;
}

async function initPush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const reg = await navigator.serviceWorker.register('/static/sw.js');
    await navigator.serviceWorker.ready;
    if (Notification.permission !== 'granted') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') return;
    }
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: u8FromB64url(VAPID_PUBLIC)
      });
    }
    mySub = sub;
    announcePushAll();
  } catch (e) {}
}

function announcePush(topic) {
  if (client) {
    client.publish(topic, JSON.stringify({
      from: ME,
      t: 'push',
      sub: mySub ? JSON.stringify(mySub) : null,
      since: typeof MYSINCE !== 'undefined' ? MYSINCE : null,
      nm: typeof MYNAME !== 'undefined' ? MYNAME : ''
    }), { retain: true });
  }
}

function announcePushAll() {
  try {
    if (typeof topicMap !== 'undefined') {
      Object.keys(topicMap).forEach(t => announcePush(t));
    }
  } catch (e) {}
}

function sendPush(members, title, body, tag) {
  try {
    const subs = [];
    (members || []).forEach(n => {
      if (n !== ME && peerPush[n]) {
        try { subs.push(JSON.parse(peerPush[n])); } catch (e) {}
      }
    });
    if (!subs.length) return;

    // Petición hacia el backend Django (Sustituye Netlify)
    fetch('/api/send-push/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': typeof getCsrfToken === 'function' ? getCsrfToken() : ''
      },
      body: JSON.stringify({ subs, title, body, tag })
    }).catch(() => {});
  } catch (e) {}
}