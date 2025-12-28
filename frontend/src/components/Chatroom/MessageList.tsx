import { useState, useRef, useEffect } from 'react';
import { api } from '../../services/api';
import { connectSocket } from '../../services/socket';

const currentUser = { uid: null as string | null };
type Attachment = { url: string; type: 'image' | 'video' | 'document'; name?: string };
type Message = {
  id: string;
  userId?: string;
  userName?: string;
  userAvatar?: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  reactions?: { [user: string]: string };
  attachments?: Attachment[];
};

const initialMessages: Message[] = [
  { id: '1', userName: 'Alice', text: 'Hello everyone!' },
  { id: '2', userName: 'Bob', text: 'Hi Alice!' },
  { id: '3', userName: 'Charlie', text: 'Good morning!' },
  { id: '4', userName: 'You', text: 'This is my own message.' },
  { id: '5', userName: 'Alice', mediaUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=400&q=80', mediaType: 'image' },
  { id: '6', userName: 'You', mediaUrl: 'https://www.w3schools.com/html/mov_bbb.mp4', mediaType: 'video' },
];

const reactionEmojis = ['👍', '❤️', '😂', '😮', '😢', '😠'];

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

const MessageList = ({ chatroomId }: { chatroomId?: string }) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [menuOpen, setMenuOpen] = useState<{ id: string; position: 'top' | 'bottom' } | null>(null);
  const [reactionsOpen, setReactionsOpen] = useState<{ id: string; position: 'top' | 'bottom' } | null>(null);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [fullScreenType, setFullScreenType] = useState<'image' | 'video' | 'document' | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // cache of users keyed by id so we can show avatars even when message payloads don't include them
  const [usersMap, setUsersMap] = useState<Record<string, { avatarUrl?: string; displayName?: string; username?: string }>>({});

  // Refs for measuring layout so we can show the picker where it is visible
  const containerRef = useRef<HTMLDivElement | null>(null);
  const messageRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const listEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!chatroomId) return;

    let mounted = true;

    const normalizeIncomingMessage = (raw: any) => {
      if (!raw) return raw;
      const m: any = { id: raw.id ?? raw._id ?? raw._id?.toString?.() ?? String(Math.random()), ...raw };
      // normalize userId to string/null
      m.userId = (m.userId !== undefined && m.userId !== null) ? String(m.userId) : null;
      // normalize sender avatar from common payload shapes
      const possibleAvatar = m.userAvatar || m.avatar || m.avatarUrl || m.user?.avatarUrl || m.user?.avatar || m.user?.profile?.avatar || m.sender?.avatar;
      if (possibleAvatar) {
        let avatarUrl = possibleAvatar;
        if (typeof avatarUrl === 'string' && avatarUrl.startsWith('/uploads')) avatarUrl = `${BACKEND_URL}${avatarUrl}`;
        m.userAvatar = avatarUrl;
      }
      // normalize sender name if present in common fields
      if (!m.userName) m.userName = m.user?.displayName || m.user?.name || m.user?.username || m.sender?.displayName || m.sender?.name || m.sender?.username || m.fromName || m.from;
      // normalize attachments to { url, type?, name? } and convert /uploads -> absolute
      if (m.attachments && Array.isArray(m.attachments)) {
        m.attachments = m.attachments.map((a: any) => {
          const urlRaw = typeof a === 'string' ? a : (a && (a.url || a.path || a.href) ) || '';
          let url = urlRaw || '';
          if (typeof url === 'string' && url.startsWith('/uploads')) url = `${BACKEND_URL}${url}`;
          const name = (typeof a === 'object' && a && (a.name || a.originalName)) ? (a.name || a.originalName) : undefined;
          // infer type using mime/type when available, then extension fallbacks
          const mimeLike = (a?.mime || a?.mimetype || a?.contentType || a?.type || '') as string;
          const lowerMime = String(mimeLike || '').toLowerCase();
          let type: 'image' | 'video' | 'document' = 'image';
          if (lowerMime.includes('video') || (typeof url === 'string' && url.match(/\.(mp4|webm|mov|avi|mkv)(\?|$)/i))) type = 'video';
          else if (lowerMime.includes('image') || (typeof url === 'string' && url.match(/\.(png|jpe?g|gif|svg|webp)(\?|$)/i))) type = 'image';
          else if (lowerMime.includes('pdf') || lowerMime.includes('msword') || lowerMime.includes('officedocument') || (typeof url === 'string' && url.match(/\.(pdf|docx?|xlsx?|pptx?|txt|zip|rar)(\?|$)/i))) type = 'document';
          else type = 'document';
          return { url, type, name };
        });
      }
      // try to fallback avatar/name from usersMap if available
      if ((!m.userAvatar || !m.userName) && m.userId && usersMap[String(m.userId)]) {
        const u = usersMap[String(m.userId)];
        if (!m.userAvatar && u.avatarUrl) m.userAvatar = u.avatarUrl;
        if ((!m.userName || m.userName === '') && (u.displayName || u.username)) m.userName = u.displayName || u.username;
      }
      return m;
    };

    // fetch initial messages from backend
    (async () => {
      try {
        const docs: any = await api.getMessages(chatroomId);
        if (!mounted) return;
        const mapped = (docs || []).map((d: any) => normalizeIncomingMessage({ id: d.id, ...d }));
        setMessages(mapped as Message[]);
        setTimeout(() => listEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      } catch (err) {
        console.error('Failed to load messages', err);
      }
    })();

    // load users cache for avatar fallback (do this once per chatroom)
    (async () => {
      try {
        const all: any[] = await api.getUsers();
        if (!mounted) return;
        const map: Record<string, any> = {};
        (all || []).forEach(u => {
          if (!u || !u.id) return;
          let avatar = u.avatarUrl || u.avatar || '';
          if (typeof avatar === 'string' && avatar.startsWith('/uploads')) avatar = `${BACKEND_URL}${avatar}`;
          map[String(u.id)] = { avatarUrl: avatar || '', displayName: u.displayName || u.name || u.username, username: u.username };
        });
        setUsersMap(map);
      } catch (err) {
        // ignore
      }
    })();

    // derive current user uid from JWT stored in localStorage
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          currentUser.uid = payload?.uid || payload?.sub || null;
        }
      }
    } catch (e) {
      currentUser.uid = null;
    }

    // connect socket and join room
    const token = localStorage.getItem('token') || undefined;
    const socket = connectSocket(token as any);
    const onNewMessage = (msg: any) => {
      const normMsg = normalizeIncomingMessage(msg);
      // append incoming message
      setMessages(prev => {
        // avoid duplicates
        if (prev.some(m => m.id === normMsg.id)) return prev;
        return [...prev, normMsg];
      });
      setTimeout(() => listEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 20);
    };

    socket.emit('join', chatroomId);
    socket.on('message:new', onNewMessage);

    return () => {
      mounted = false;
      try {
        socket.emit('leave', chatroomId);
        socket.off('message:new', onNewMessage);
      } catch (e) {
        // ignore
      }
    };
  }, [chatroomId]);

  // When usersMap becomes available, merge avatar/displayName into already-loaded messages
  useEffect(() => {
    if (!usersMap || Object.keys(usersMap).length === 0) return;
    setMessages(prev => prev.map(m => {
      if (!m || !m.userId) return m;
      const u = usersMap[String(m.userId)];
      if (!u) return m;
      const avatar = (m as any).userAvatar || u.avatarUrl || null;
      const name = (m as any).userName || u.displayName || u.username || (m as any).userName;
      return { ...m, userAvatar: avatar, userName: name } as any;
    }));
  }, [usersMap]);

  // Listen for in-app open requests from the info panel (chat:open-attachment)
  useEffect(() => {
    const handler = (e: any) => {
      try {
        const detail = (e as CustomEvent)?.detail;
        console.debug('[MessageList] chat:open-attachment received', detail);
        if (!detail || !detail.url) return;
        const url = detail.url;
        const type = (detail.type as string) || inferTypeFrom(url);
        const t = type === 'video' ? 'video' : type === 'image' ? 'image' : 'document';
        setFullScreenType(t as any);
        setFullScreenImage(url);
        // request the header/info panel to close so viewer is visible and not hidden behind it
        try { window.dispatchEvent(new CustomEvent('chat:close-panel')); } catch (e) {}
      } catch (err) {
        // ignore
      }
    };
    window.addEventListener('chat:open-attachment', handler as EventListener);
    return () => window.removeEventListener('chat:open-attachment', handler as EventListener);
  }, []);

  // Close viewer on Escape and pause video when closing
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setFullScreenImage(null);
        setFullScreenType(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Pause video when modal closes or source changes
  useEffect(() => {
    if (!fullScreenImage && videoRef.current) {
      try { videoRef.current.pause(); } catch (e) {}
    }
  }, [fullScreenImage]);

  // helper to determine attachment type from provided type or url
  const inferTypeFrom = (url: string | undefined, provided?: string | null) => {
    if (provided === 'video' || provided === 'image') return provided as 'video' | 'image';
    if (!url || typeof url !== 'string') return 'image';
    if (url.match(/\.(mp4|webm|mov|ogg|mkv)(\?|$)/i)) return 'video';
    if (url.match(/\.(pdf|docx?|xlsx?|pptx?|txt|zip|rar)(\?|$)/i)) return 'document';
    return 'image';
  };

  const toggleReactions = (id: string) => {
    // close if already open for same id
    if (reactionsOpen?.id === id) {
      setReactionsOpen(null);
      return;
    }

    const msgEl = messageRefs.current[id];
    const containerEl = containerRef.current;
    if (!msgEl || !containerEl) {
      setReactionsOpen({ id, position: 'top' });
      return;
    }

    const containerRect = containerEl.getBoundingClientRect();
    const msgRect = msgEl.getBoundingClientRect();

    const spaceAbove = msgRect.top - containerRect.top; // space above the message within the scroll container
    const spaceBelow = containerRect.bottom - msgRect.bottom; // space below within container

    // Prefer showing picker above (top) unless there's not enough space, then show below
    const position: 'top' | 'bottom' = spaceAbove > 120 || spaceBelow < 120 ? 'top' : 'bottom';
    setReactionsOpen({ id, position });
  };

  // Toggle menu with adaptive position (top/bottom) based on available space
  const toggleMenu = (id: string) => {
    if (menuOpen?.id === id) {
      setMenuOpen(null);
      return;
    }

    const msgEl = messageRefs.current[id];
    const containerEl = containerRef.current;
    if (!msgEl || !containerEl) {
      setMenuOpen({ id, position: 'top' });
      return;
    }

    const containerRect = containerEl.getBoundingClientRect();
    const msgRect = msgEl.getBoundingClientRect();

    const spaceAbove = msgRect.top - containerRect.top;
    const spaceBelow = containerRect.bottom - msgRect.bottom;

    // If there's little space below, show menu above; otherwise show below
    const position: 'top' | 'bottom' = spaceBelow < 140 && spaceAbove > spaceBelow ? 'top' : 'bottom';
    setMenuOpen({ id, position });
  };

  const handleReact = (id: string, emoji: string) => {
    setMessages(msgs =>
      msgs.map(m => {
        if (m.id !== id) return m;
        // Remove reaction if clicking the same emoji
        if (m.reactions?.[currentUser.uid || ''] === emoji) {
          const { [currentUser.uid || '']: _, ...rest } = m.reactions || {};
          return { ...m, reactions: rest };
        }
        // Otherwise, set/replace reaction
        return {
          ...m,
          reactions: { ...m.reactions, [currentUser.uid || '']: emoji },
        };
      })
    );
    setReactionsOpen(null);
  };

  const handleUnsend = (id: string) => {
    setMessages(msgs => msgs.filter(m => m.id !== id));
    setMenuOpen(null);
  };

  // Helper to count reactions for each emoji
  const getReactionCounts = (reactions: { [user: string]: string } | undefined) => {
    const counts: { [emoji: string]: number } = {};
    if (!reactions) return counts;
    Object.values(reactions).forEach(emoji => {
      counts[emoji] = (counts[emoji] || 0) + 1;
    });
    return counts;
  };

  return (
    <div ref={containerRef} className="bg-white/90 rounded-xl shadow p-4 flex flex-col gap-4 w-full h-full min-h-0">
      {/* ...existing code... (reply UI removed) */}
      {/* Messages area uses flex-1 to take remaining space and is scrollable */}
      <div className="flex-1 overflow-auto pb-24 min-h-0">
        {messages.map(msg => {
          const reactionCounts = getReactionCounts(msg.reactions);
          const userReaction = msg.reactions?.[currentUser.uid || ''];
          const isMediaOnly = (!!msg.attachments && msg.attachments.length > 0) && !msg.text;
          return (
            <div key={msg.id} className={`group flex flex-col gap-2 relative px-2 py-1 transition ${msg.userId === currentUser.uid ? 'items-end' : 'items-start'}`}>
              <div ref={el => { messageRefs.current[msg.id] = el; }} className={`flex items-end max-w-[80%] ${msg.userId === currentUser.uid ? 'flex-row-reverse gap-2' : 'gap-4'}`}>
                {/* Avatar bubble */}
                {msg.userId !== currentUser.uid && (
                  <div className="w-8 h-8 rounded-full bg-blue-200 flex items-center justify-center font-bold text-blue-700 text-xs shrink-0 overflow-hidden">
                    {msg.userAvatar ? (
                      <img src={msg.userAvatar} alt={`${msg.userName || 'User'} avatar`} className="w-full h-full object-cover" />
                    ) : (
                      <span>{(msg.userName || '?')[0]}</span>
                    )}
                  </div>
                )}
                {/* Message bubble or media-only display */}
                {isMediaOnly ? (
                  // Media-only: show all attachments. Multiple attachments render as thumbnails/grid, single attachment appears larger.
                  <div className="relative flex flex-col">
                    <div className={`${msg.attachments && msg.attachments.length > 1 ? 'flex flex-wrap gap-3' : ''}`}>
                      {msg.attachments && msg.attachments.map((att, idx) => (
                        att.type === 'image' ? (
                          <img
                            key={idx}
                            src={att.url}
                            alt={att.name || 'sent'}
                            className={msg.attachments!.length > 1 ? 'rounded-xl object-cover shadow-lg w-[160px] h-[120px] cursor-pointer' : 'rounded-xl object-cover shadow-lg max-w-[320px] max-h-[240px] cursor-pointer'}
                            onClick={() => setFullScreenImage(att.url)}
                          />
                        ) : att.type === 'video' ? (
                          <video key={idx} controls className={msg.attachments!.length > 1 ? 'rounded-xl bg-black shadow-lg w-[240px] h-[140px] cursor-pointer' : 'rounded-xl bg-black shadow-lg max-w-[320px] max-h-[240px]'} onClick={() => setFullScreenImage(att.url)}>
                            <source src={att.url} />
                          </video>
                        ) : att.type === 'document' ? (
                          <div key={idx} className="rounded-xl bg-white border p-3 flex items-center gap-3 max-w-[320px]">
                            <div className="text-2xl">📄</div>
                            <div className="flex-1 text-sm">
                              <div className="font-medium">{att.name || 'Document'}</div>
                              <a href={att.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">Download</a>
                            </div>
                          </div>
                        ) : (
                          // fallback to a simple file card
                          <div key={idx} className="rounded-xl bg-white border p-3 flex items-center gap-3 max-w-[320px]">
                            <div className="text-2xl">📎</div>
                            <div className="flex-1 text-sm">
                              <div className="font-medium">{att.name || 'Attachment'}</div>
                              <a href={att.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">Open / Download</a>
                            </div>
                          </div>
                        )
                      ))}
                    </div>
                    {/* Reactions summary under the media */}
                    {Object.keys(reactionCounts).length > 0 && (
                      <div className="flex gap-1 mt-2 bg-white/90 rounded-full px-2 py-0.5 shadow text-base border w-fit">
                        {Object.entries(reactionCounts).map(([emoji, count]) => (
                          <span key={emoji} className="flex items-center gap-0.5">
                            {emoji} <span className="text-xs font-bold">{count}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  // Text-only or text+media inside a bubble
                  <div className={`relative rounded-2xl px-4 py-2 shadow ${msg.userId === currentUser.uid ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-900'} flex flex-col gap-2`}>
                    {msg.text && <span>{msg.text}</span>}
                    {msg.attachments && msg.attachments.map((a, i) => (
                      a.type === 'image' ? (
                        <img key={i} src={a.url} alt={a.name || 'attachment'} className="rounded-xl mt-2 max-w-[240px] max-h-[160px] object-cover cursor-pointer" onClick={() => setFullScreenImage(a.url)} />
                      ) : a.type === 'video' ? (
                        <video key={i} controls className="rounded-xl mt-2 max-w-[240px] max-h-[160px] bg-black">
                          <source src={a.url} />
                        </video>
                      ) : (
                        <div key={i} className="mt-2 px-3 py-2 bg-white rounded-md border text-sm text-gray-700">{a.name}</div>
                      )
                    ))}
                    {/* Reactions summary (Messenger style) */}
                    {Object.keys(reactionCounts).length > 0 && (
                      <div className="flex gap-1 mt-1 bg-white/80 rounded-full px-2 py-0.5 shadow text-base border w-fit">
                        {Object.entries(reactionCounts).map(([emoji, count]) => (
                          <span key={emoji} className="flex items-center gap-0.5">
                            {emoji} <span className="text-xs font-bold">{count}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Actions container: reaction button + menu (separate to avoid overlap) */}
                <div className={`flex items-center ${msg.userId === currentUser.uid ? '' : ''}`}>
                  {/* Reaction button (now outside bubble) */}
                  <div className="relative">
                    <button
                      className="text-xl opacity-80 hover:opacity-100 focus:outline-none"
                      onClick={() => toggleReactions(msg.id)}
                      aria-label="Add reaction"
                    >
                      😊
                    </button>

                    {/* Reactions picker positioned relative to this actions block */}
                    {reactionsOpen?.id === msg.id && (
                      <div className={`flex gap-2 mt-2 absolute left-1/2 -translate-x-1/2 ${reactionsOpen.position === 'top' ? 'bottom-10' : 'top-10'} bg-white border rounded-xl px-3 py-2 shadow z-40`}>
                        {reactionEmojis.map(emoji => (
                          <button
                            key={emoji}
                            className={`text-xl hover:scale-125 transition-transform focus:outline-none ${userReaction === emoji ? 'ring-2 ring-blue-400' : ''}`}
                            onClick={() => handleReact(msg.id, emoji)}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Three dots menu */}
                  <div className="relative">
                    <button
                      className="opacity-60 group-hover:opacity-100 text-lg px-2 focus:outline-none"
                      onClick={() => toggleMenu(msg.id)}
                      aria-label="More actions"
                    >
                      &#8942;
                    </button>
                    {menuOpen?.id === msg.id && (
                      <div className={`absolute right-0 ${menuOpen.position === 'top' ? 'bottom-10' : 'top-8'} z-50 bg-white border rounded shadow-lg py-1 w-36`}>
                        {msg.userId === currentUser.uid && (
                          <button className="block w-full text-left px-4 py-2 hover:bg-blue-100" onClick={() => handleUnsend(msg.id)}>Unsend</button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={listEndRef} />
      </div>
      {/* Keep input always visible below messages */}
      {/* Input is rendered by MessageInput component in parent; ensure parent layout keeps it visible */}
      {/* Full screen image modal */}
      {fullScreenImage && (
        <div className="fixed inset-0 bg-black bg-opacity-65 flex items-center justify-center z-60" onClick={() => { setFullScreenImage(null); setFullScreenType(null); }}>
          <button
            className="absolute top-4 right-4 text-white text-3xl hover:text-gray-300 focus:outline-none"
            onClick={(e) => { e.stopPropagation(); setFullScreenImage(null); setFullScreenType(null); }}
            aria-label="Close full screen media"
          >
            ×
          </button>
          <div className="max-w-[90vw] max-h-[80vh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            {fullScreenType === 'video' ? (
              <div className="bg-black rounded-md p-2 shadow-lg flex items-center justify-center">
                <video
                  ref={(el) => { videoRef.current = el; return; }}
                  controls
                  playsInline
                  className="max-w-[1100px] max-h-[70vh] w-auto h-auto object-contain rounded"
                  onError={() => setFullScreenImage(null)}
                >
                  <source src={fullScreenImage!} />
                  Your browser does not support the video tag.
                </video>
              </div>
            ) : fullScreenType === 'image' ? (
              <div className="bg-black rounded-md p-2 shadow-lg flex items-center justify-center">
                <img src={fullScreenImage} alt="Full screen" className="max-w-[1100px] max-h-[70vh] object-contain rounded" onError={() => setFullScreenImage(null)} />
              </div>
            ) : (
              // document / file view: show filename and download link inside modal
              <div className="bg-white rounded-md p-4 max-w-[90vw] max-h-[80vh] overflow-auto text-left">
                <div className="text-lg font-medium mb-2">{(() => {
                  try {
                    // try to infer name from attachments currently loaded
                    for (const m of messages) {
                      const match = (m.attachments || []).find(a => a.url === fullScreenImage);
                      if (match) return match.name || (fullScreenImage as string).split('/').pop();
                    }
                  } catch (e) {}
                  return (fullScreenImage as string).split('/').pop();
                })()}</div>
                <div className="text-sm text-gray-700 mb-4">Preview not available — you can download the file below.</div>
                <div>
                  <a href={fullScreenImage as string} target="_blank" rel="noreferrer" className="inline-block px-3 py-2 bg-blue-600 text-white rounded">Open / Download</a>
                </div>
              </div>
            )}
            {/* show filename / download for backreading */}
            <div className="text-sm text-white/90 mt-2">
              {(() => {
                for (const m of messages) {
                  const match = (m.attachments || []).find(a => a.url === fullScreenImage);
                  if (match) return (
                    <div className="flex items-center gap-2">
                      <div className="font-medium">{match.name || 'Attachment'}</div>
                      {(fullScreenImage!.startsWith('http') || fullScreenImage!.startsWith(BACKEND_URL) || fullScreenImage!.startsWith('blob:')) && (
                        <a href={fullScreenImage} target="_blank" rel="noreferrer" className="text-xs text-blue-200 underline">Download</a>
                      )}
                    </div>
                  );
                }
                return <div className="font-medium">Attachment</div>;
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default MessageList;
