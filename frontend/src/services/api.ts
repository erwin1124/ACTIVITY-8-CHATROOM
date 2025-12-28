// API service for backend calls
import { getIdToken } from './firebase';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

export async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = await getIdToken();
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string> || {}),
  };
  // Only set content-type when body is JSON
  if (!(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers,
  });

  if (!res.ok) {
    // read body once as text to avoid consuming stream multiple times
    const ct = res.headers.get('content-type') || '';
    const text = await res.text();
    if (ct.includes('application/json')) {
      try {
        const body = JSON.parse(text);
        const msg = body?.message || body?.error || text;
        throw new Error(msg);
      } catch (e) {
        throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
      }
    }

    throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
  }

  // try parse json
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

export const api = {
  // auth
  signup: (body: any) => apiFetch('/auth/signup', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: any) => apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  // files
  uploadFiles: (formData: FormData) => apiFetch('/files/upload', { method: 'POST', body: formData }),

  // chatrooms & messages
  getChatrooms: () => apiFetch('/chatrooms?mine=1'),
  getChatroom: (id: string) => apiFetch(`/chatrooms/${id}`),
  createChatroom: (body: any) => apiFetch('/chatrooms', { method: 'POST', body: JSON.stringify(body) }),
  joinChatroom: (id: string) => apiFetch(`/chatrooms/${id}/join`, { method: 'POST' }),
  leaveChatroom: (id: string) => apiFetch(`/chatrooms/${id}/leave`, { method: 'POST' }),
  kickChatroomMember: (id: string, targetUserId: string) => apiFetch(`/chatrooms/${id}/kick`, { method: 'POST', body: JSON.stringify({ targetUserId }) }),
  deleteChatroom: (id: string) => apiFetch(`/chatrooms/${id}`, { method: 'DELETE' }),
  getMessages: (chatroomId: string) => apiFetch(`/messages/chatroom/${chatroomId}`),
  sendMessage: (chatroomId: string, body: any) => apiFetch('/messages', { method: 'POST', body: JSON.stringify({ chatroomId, ...body }) }),
  reactMessage: (messageId: string, emoji: string | null) => apiFetch(`/messages/${messageId}/react`, { method: 'POST', body: JSON.stringify({ emoji }) }),
  unsendMessage: (messageId: string) => apiFetch(`/messages/${messageId}/unsend`, { method: 'POST' }),

  // users
  getUsers: () => apiFetch('/auth/users'),
  getMe: () => apiFetch('/auth/me'),
  updateMe: (body: any) => apiFetch('/auth/me', { method: 'PATCH', body: JSON.stringify(body) }),
};
