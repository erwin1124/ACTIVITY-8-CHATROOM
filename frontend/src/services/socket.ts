import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
// simple in-memory pub/sub so UI components can subscribe to server events
const listeners: Record<string, Set<(...args: any[]) => void>> = {};

function emitToListeners(event: string, ...args: any[]) {
  const set = listeners[event];
  if (!set) return;
  for (const cb of Array.from(set)) {
    try { cb(...args); } catch (err) { console.error('[socket] listener error', event, err); }
  }
}

function attachSocketHandlers(s: Socket) {
  const events = [
    'chatroom:member:joined',
    'chatroom:member:left',
    'chatroom:member:kicked',
    'chatroom:deleted',
    'chatroom:owner:changed',
    'chatroom:created',
    'user:online',
    'user:offline',
    'message:new',
    'message:updated',
    'message:react',
  ];
  for (const ev of events) {
    s.on(ev, (...args: any[]) => {
      // forward to subscribers
      emitToListeners(ev, ...args);
    });
  }
}

export function connectSocket(token?: string) {
  if (socket) return socket;
  const url = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
  socket = io(url, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });
  socket.on('connect', () => {
    console.log('[socket] connected', socket?.id);
  });
  socket.on('connect_error', (err: any) => console.warn('[socket] connect_error', err));
  attachSocketHandlers(socket);
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// pub/sub helpers for components
export function onEvent(event: string, cb: (...args: any[]) => void) {
  if (!listeners[event]) listeners[event] = new Set();
  listeners[event].add(cb);
}

export function offEvent(event: string, cb: (...args: any[]) => void) {
  listeners[event]?.delete(cb);
}
