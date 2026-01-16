import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import { connectSocket } from '../../services/socket';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

// Header for chatroom view with an info panel for members / media / files
const ChatroomHeader = ({ chatroomId }: { chatroomId?: string }) => {
  const navigate = useNavigate();
  const [chatroomName, setChatroomName] = useState('General');
  const [members, setMembers] = useState<Array<{ id: string; displayName?: string; username?: string; avatarUrl?: string }>>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'members' | 'media' | 'files'>('media');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const displayId = chatroomId || '12312';
  const [isMember, setIsMember] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(null);

  // media/files state for info panel
  const [mediaItems, setMediaItems] = useState<Array<{ url: string; type: string; name?: string; messageId?: string }>>([]);
  const [fileItems, setFileItems] = useState<Array<{ url: string; name?: string; messageId?: string }>>([]);

  // --- NEW: factor member fetching into a reusable function
  const refreshChatroomHeader = useCallback(async () => {
    if (!chatroomId) return;
    try {
      const res: any = await api.getChatroom(chatroomId);
      if (!res) return;

      setChatroomName(res.name || 'Chatroom');
      setOwnerId(res.ownerId || null);

      try {
        const all: any[] = await api.getUsers();
        const roomMembers = (res.members || [])
          .map((mid: string) => all.find(u => u.id === mid))
          .filter(Boolean);

        const normalized = roomMembers.map((u: any) => ({
          ...u,
          avatarUrl:
            u?.avatarUrl && typeof u.avatarUrl === 'string' && u.avatarUrl.startsWith('/uploads')
              ? `${BACKEND_URL}${u.avatarUrl}`
              : (u?.avatarUrl || u?.avatar || ''),
        }));

        setMembers(normalized as any);

        // derive membership from localStorage user
        const user = localStorage.getItem('user');
        try {
          const cur = user ? JSON.parse(user) : null;
          setIsMember(!!roomMembers.find((m: any) => m && m.id === cur?.id));
        } catch (e) {}
      } catch (e) {
        // fallback
        setMembers((res.members || []).map((m: string) => ({ id: m, displayName: m })));
      }
    } catch (e) {
      // ignore
    }
  }, [chatroomId]);

  useEffect(() => {
    const onCloseRequest = () => setPanelOpen(false);
    window.addEventListener('chat:close-panel', onCloseRequest as EventListener);

    // initial load
    refreshChatroomHeader();

    return () => window.removeEventListener('chat:close-panel', onCloseRequest as EventListener);
  }, [refreshChatroomHeader]);

  // --- NEW: subscribe to realtime member updates via socket
  useEffect(() => {
    if (!chatroomId) return;

    const token = localStorage.getItem('token') || undefined;
    const socket = connectSocket(token as any);

    // join socket room so server can target events to this chatroom (your socket.ts supports 'join')
    socket.emit('join', chatroomId);

    const onMemberChanged = async (payload: any) => {
      const id = payload?.chatroomId;
      if (!id || String(id) !== String(chatroomId)) return;
      await refreshChatroomHeader();
    };

    const onOwnerChanged = async (payload: any) => {
      const id = payload?.chatroomId;
      if (!id || String(id) !== String(chatroomId)) return;
      // owner changed affects UI badge and kick permissions
      await refreshChatroomHeader();
    };

    socket.on('chatroom:member:joined', onMemberChanged);
    socket.on('chatroom:member:left', onMemberChanged);
    socket.on('chatroom:member:kicked', onMemberChanged);
    socket.on('chatroom:owner:changed', onOwnerChanged);
    socket.on('chatroom:deleted', onMemberChanged);

    return () => {
      try {
        socket.emit('leave', chatroomId);
        socket.off('chatroom:member:joined', onMemberChanged);
        socket.off('chatroom:member:left', onMemberChanged);
        socket.off('chatroom:member:kicked', onMemberChanged);
        socket.off('chatroom:owner:changed', onOwnerChanged);
        socket.off('chatroom:deleted', onMemberChanged);
      } catch (e) {
        // ignore
      }
    };
  }, [chatroomId, refreshChatroomHeader]);

  useEffect(() => {
    if (!chatroomId) return;

    const token = localStorage.getItem('token') || undefined;
    const socket = connectSocket(token as any);

    const onKicked = (payload: any) => {
      if (String(payload?.chatroomId) !== String(chatroomId)) return;
      alert('You were removed from this chatroom.');
      window.location.href = '/home'; // change to your route
    };

    socket.on('chatroom:kicked', onKicked);
    return () => socket.off('chatroom:kicked', onKicked);
  }, [chatroomId]);

  // Fetch messages' attachments for media/files tab when panel opens or tab changes
  useEffect(() => {
    if (!panelOpen || !chatroomId) return;
    if (activeTab !== 'media' && activeTab !== 'files') return;

    let mounted = true;
    (async () => {
      try {
        const msgs: any[] = await api.getMessages(chatroomId);
        if (!mounted) return;
        const media: Array<any> = [];
        const files: Array<any> = [];
        (msgs || []).forEach(m => {
          const atts = m.attachments || [];
          (atts || []).forEach((a: any) => {
            const rawUrl = a?.url || a;
            let url = rawUrl;
            if (typeof url === 'string' && url.startsWith('/uploads')) url = `${BACKEND_URL}${url}`;
            const mimeLike = (a?.mime || a?.type || '');
            const typeGuess = (mimeLike.includes('video') || (typeof url === 'string' && url.match(/\.(mp4|webm|mov)$/i))) ? 'video' : ((mimeLike.includes('image') || (typeof url === 'string' && url.match(/\.(png|jpe?g|gif|svg)$/i))) ? 'image' : 'file');
            const item = { url, type: typeGuess, name: a?.originalName || a?.name || `${m.id || ''}-attachment`, messageId: m.id };
            if (typeGuess === 'image' || typeGuess === 'video') media.push(item);
            else files.push({ url, name: item.name, messageId: m.id });
          });
        });
        setMediaItems(media);
        setFileItems(files);
      } catch (err) {
        console.error('Failed to load attachments for panel', err);
      }
    })();

    return () => { mounted = false; };
  }, [panelOpen, activeTab, chatroomId]);

  const handleJoin = async () => {
    if (!chatroomId) return;
    try {
      await api.joinChatroom(chatroomId);
      // refresh members
      await refreshChatroomHeader();
      setIsMember(true);
    } catch (err) { console.error(err); alert('Failed to join'); }
  };

  const handleLeave = async () => {
    if (!chatroomId) return;
    try {
      await api.leaveChatroom(chatroomId);
      await refreshChatroomHeader();
      setIsMember(false);
    } catch (err) { console.error(err); alert('Failed to leave'); }
  };

  const handleKickMember = async (targetId: string) => {
    try {
      await api.kickChatroomMember(chatroomId || '', targetId);
      await refreshChatroomHeader();
      alert('Member kicked');
    } catch (err) {
      console.error(err);
      alert('Failed to kick member');
    }
  };

  const handleDeleteRoom = async () => {
    if (!chatroomId) return;
    if (!confirm('Delete this chatroom? This cannot be undone.')) return;
    try {
      await api.deleteChatroom(chatroomId);
      alert('Chatroom deleted');
      navigate('/home');
    } catch (err) {
      console.error(err);
      alert('Failed to delete chatroom');
    }
  };

  return (
    <div className="relative flex items-center justify-between bg-white/90 rounded-xl shadow px-6 py-3">
      <h2 className="text-2xl font-bold text-blue-700">{chatroomName} Chatroom</h2>

      <div className="flex items-center gap-3">
        <button
          className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold hover:bg-blue-200 focus:outline-none"
          onClick={() => setPanelOpen(prev => !prev)}
          aria-expanded={panelOpen}
          aria-label="Open members, media and files panel"
        >
          i
        </button>

        {panelOpen && (
          <div className="absolute right-6 top-full mt-3 w-96 bg-white rounded-xl shadow-lg border z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="text-sm text-gray-700 font-semibold">Media and files</div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-gray-500 mr-2">{members.length} members</div>

                <div className="relative">
                  <button
                    className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200"
                    onClick={() => setSettingsOpen(prev => !prev)}
                    aria-haspopup="true"
                    aria-expanded={settingsOpen}
                    aria-label="Open chatroom settings"
                  >
                    ⚙
                  </button>

                  {settingsOpen && (
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-md border z-60 py-2 max-h-64 overflow-y-auto">
                      <button
                        className="w-full text-left px-4 py-2 hover:bg-gray-100"
                        onClick={() => { const newName = prompt('Enter new chatroom name', chatroomName); if (newName && newName.trim()) { setChatroomName(newName.trim()); alert(`Chatroom name changed to: ${newName}`); } setSettingsOpen(false); }}
                      >
                        Change chatroom name
                      </button>
                      <button
                        className="w-full text-left px-4 py-2 hover:bg-gray-100"
                        onClick={() => { if (!isMember) return alert('You are not a member'); if (confirm('Leave chatroom?')) handleLeave(); setSettingsOpen(false); }}
                      >
                        Leave chatroom
                      </button>

                      <div className="w-full text-left px-4 py-2 text-sm text-gray-600 bg-gray-50">Chatroom ID: {displayId}</div>

                      <button
                        className={`w-full text-left px-4 py-2 ${!isMember ? 'text-gray-400 cursor-not-allowed' : 'hover:bg-gray-100'}`}
                        onClick={() => { if (!isMember) return alert('Only members can delete chatrooms'); if (confirm('Delete chatroom?')) handleDeleteRoom(); setSettingsOpen(false); }}
                        disabled={!isMember}
                      >
                        Delete chatroom
                      </button>
                      <div className="px-4 py-2 text-xs text-gray-500">Kick members (owner only)</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex px-2 py-2 gap-2 bg-gray-50">
              <button
                className={`flex-1 text-left px-3 py-2 rounded ${activeTab === 'media' ? 'bg-white shadow' : 'hover:bg-gray-100'}`}
                onClick={() => setActiveTab('media')}
              >
                Media
              </button>
              <button
                className={`flex-1 text-left px-3 py-2 rounded ${activeTab === 'files' ? 'bg-white shadow' : 'hover:bg-gray-100'}`}
                onClick={() => setActiveTab('files')}
              >
                Files
              </button>
              <button
                className={`flex-1 text-left px-3 py-2 rounded ${activeTab === 'members' ? 'bg-white shadow' : 'hover:bg-gray-100'}`}
                onClick={() => setActiveTab('members')}
              >
                Members
              </button>
            </div>

            <div className="p-3 max-h-64 overflow-y-auto">
              {activeTab === 'media' && (
                <div className="grid grid-cols-2 gap-2">
                  {mediaItems.length === 0 ? (
                    <div className="col-span-2 text-sm text-gray-500">No media yet</div>
                  ) : mediaItems.map((m, idx) => (
                    <div key={m.url + idx} className="rounded overflow-hidden border bg-gray-50 p-1">
                      {m.type === 'image' ? (
                        <button
                          type="button"
                          onClick={() => { window.dispatchEvent(new CustomEvent('chat:open-attachment', { detail: { url: m.url, name: m.name, type: m.type } })); setPanelOpen(false); }}
                          className="block hover:opacity-90 w-full"
                          aria-label={`Open ${m.name || 'image'}`}
                        >
                          <img src={m.url} alt={m.name} className="w-full h-32 object-cover cursor-pointer" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { window.dispatchEvent(new CustomEvent('chat:open-attachment', { detail: { url: m.url, name: m.name, type: m.type } })); setPanelOpen(false); }}
                          className="block hover:opacity-90 w-full"
                          aria-label={`Open ${m.name || 'video'}`}
                        >
                          <video src={m.url} className="w-full h-32 object-cover cursor-pointer" playsInline muted onClick={() => { window.dispatchEvent(new CustomEvent('chat:open-attachment', { detail: { url: m.url, name: m.name, type: m.type } })); setPanelOpen(false); }} />
                        </button>
                      )}
                      <div className="text-xs text-gray-600 px-2 py-1">{m.name}</div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'files' && (
                <ul className="space-y-2">
                  {fileItems.length === 0 ? (
                    <li className="text-sm text-gray-500">No files yet</li>
                  ) : fileItems.map(f => (
                    <li key={f.url} className="flex items-center justify-between px-2 py-2 rounded hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="text-xl">📄</div>
                        <a href={f.url} target="_blank" rel="noreferrer" className="font-medium text-sm text-blue-600 underline">{f.name}</a>
                      </div>
                      <div className="text-xs text-gray-500">Message #{f.messageId}</div>
                    </li>
                  ))}
                </ul>
              )}

              {activeTab === 'members' && (
                <ul className="space-y-2">
                  {members.map(u => (
                    <li key={u.id} className="flex items-center gap-3 px-2 py-2 rounded hover:bg-gray-50 justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-200 flex items-center justify-center text-blue-700 font-bold overflow-hidden">
                          {u.avatarUrl ? <img src={u.avatarUrl} alt={(u.displayName || u.username || 'User')} className="w-full h-full object-cover" /> : <span>{(u.displayName || u.username || 'U')[0]}</span>}
                        </div>
                        <div>
                          <div className="text-sm">{u.displayName || u.username || 'Unknown'} {u.id === ownerId && (<span className="ml-2 text-xs text-white bg-blue-500 px-2 py-1 rounded-full">Owner</span>)}</div>
                        </div>
                      </div>

                      <div>
                        {/* owner-only actions */}
                        {ownerId === (JSON.parse(localStorage.getItem('user') || '{}')?.id) && u.id !== ownerId ? (
                          <button className="text-sm text-red-500" onClick={() => handleKickMember(u.id)}>Kick</button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default ChatroomHeader;
