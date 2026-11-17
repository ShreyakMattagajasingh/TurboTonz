// Transport layer: host <-> phone controllers.
// Two implementations behind one interface:
//  - PeerJS (WebRTC data channels, signaling via the free PeerJS cloud) — used in production.
//  - BroadcastChannel ("local") — same-browser tabs; used for tests / offline dev.
//
// Host API:   const host = await createHost(code, { local })
//             host.onConnection(conn => ...)   host.close()
// Client API: const conn = await joinHost(code, { local })
// Connection: conn.id, conn.send(obj), conn.onMessage(cb), conn.onClose(cb), conn.close()

const PREFIX = 'partykarts-v1-';

export function isLocalMode() {
  try {
    const p = new URLSearchParams(location.search);
    return p.get('local') === '1';
  } catch { return false; }
}

export function randomCode(len = 4) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O
  let s = '';
  for (let i = 0; i < len; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

function makeConn(id, sendFn, closeFn) {
  const msgCbs = [], closeCbs = [];
  let closed = false;
  return {
    id,
    send(obj) { if (!closed) { try { sendFn(obj); } catch (e) { /* ignore */ } } },
    onMessage(cb) { msgCbs.push(cb); },
    onClose(cb) { closeCbs.push(cb); },
    close() { if (closed) return; closed = true; try { closeFn(); } catch {} closeCbs.forEach(c => c()); },
    _emit(m) { if (!closed) msgCbs.forEach(c => c(m)); },
    _closed() { if (closed) return; closed = true; closeCbs.forEach(c => c()); },
    get closed() { return closed; },
  };
}

// ---------------- Local (BroadcastChannel) ----------------
function localHost(code) {
  const bc = new BroadcastChannel(PREFIX + code);
  const conns = new Map();
  const cbs = [];
  bc.onmessage = (ev) => {
    const m = ev.data;
    if (!m || m.to !== 'host') return;
    if (m.type === 'open') {
      if (conns.has(m.from)) return;
      const conn = makeConn(m.from,
        (obj) => bc.postMessage({ to: m.from, from: 'host', type: 'msg', data: obj }),
        () => bc.postMessage({ to: m.from, from: 'host', type: 'close' }));
      conns.set(m.from, conn);
      conn.onClose(() => conns.delete(m.from));
      bc.postMessage({ to: m.from, from: 'host', type: 'accept' });
      cbs.forEach(cb => cb(conn));
    } else if (m.type === 'msg') {
      conns.get(m.from)?._emit(m.data);
    } else if (m.type === 'close') {
      conns.get(m.from)?._closed();
    }
  };
  return Promise.resolve({
    code,
    onConnection(cb) { cbs.push(cb); },
    close() { conns.forEach(c => c.close()); bc.close(); },
  });
}

function localJoin(code) {
  return new Promise((resolve, reject) => {
    const bc = new BroadcastChannel(PREFIX + code);
    const id = 'L' + Math.random().toString(36).slice(2, 10);
    let conn = null;
    const timer = setTimeout(() => { if (!conn) { bc.close(); reject(new Error('Host not found')); } }, 4000);
    bc.onmessage = (ev) => {
      const m = ev.data;
      if (!m || m.to !== id) return;
      if (m.type === 'accept' && !conn) {
        clearTimeout(timer);
        conn = makeConn(id,
          (obj) => bc.postMessage({ to: 'host', from: id, type: 'msg', data: obj }),
          () => { bc.postMessage({ to: 'host', from: id, type: 'close' }); bc.close(); });
        resolve(conn);
      } else if (m.type === 'msg') conn?._emit(m.data);
      else if (m.type === 'close') conn?._closed();
    };
    addEventListener('pagehide', () => conn?.close());
    bc.postMessage({ to: 'host', from: id, type: 'open' });
  });
}

// ---------------- PeerJS (WebRTC) ----------------
async function loadPeer() {
  const mod = await import('peerjs');
  return mod.Peer || mod.default;
}

async function peerHost(code) {
  const Peer = await loadPeer();
  return new Promise((resolve, reject) => {
    const peer = new Peer(PREFIX + code, { debug: 0 });
    const cbs = [];
    let ready = false;
    peer.on('open', () => {
      ready = true;
      resolve({
        code,
        onConnection(cb) { cbs.push(cb); },
        close() { peer.destroy(); },
        peer,
      });
    });
    peer.on('error', (err) => {
      if (!ready) reject(err);
      else console.warn('[host peer]', err.type, err);
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch {} });
    peer.on('connection', (dc) => {
      const conn = makeConn(dc.peer, (obj) => dc.send(obj), () => dc.close());
      dc.on('data', (d) => conn._emit(d));
      dc.on('close', () => conn._closed());
      dc.on('error', () => conn._closed());
      const fire = () => cbs.forEach(cb => cb(conn));
      if (dc.open) fire(); else dc.on('open', fire);
    });
  });
}

async function peerJoin(code) {
  const Peer = await loadPeer();
  return new Promise((resolve, reject) => {
    const peer = new Peer({ debug: 0 });
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; peer.destroy(); reject(new Error('Timed out connecting to host')); } }, 15000);
    peer.on('error', (err) => {
      if (!done) { done = true; clearTimeout(timer); peer.destroy(); reject(err); }
    });
    peer.on('open', () => {
      const dc = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      dc.on('open', () => {
        if (done) return;
        done = true; clearTimeout(timer);
        const conn = makeConn(peer.id, (obj) => dc.send(obj), () => { dc.close(); peer.destroy(); });
        dc.on('data', (d) => conn._emit(d));
        dc.on('close', () => conn._closed());
        resolve(conn);
      });
    });
  });
}

export function createHost(code, { local = false } = {}) {
  return local ? localHost(code) : peerHost(code);
}

export function joinHost(code, { local = false } = {}) {
  return local ? localJoin(code) : peerJoin(code);
}
