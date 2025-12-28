import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import ChatroomForm from '../components/Chatroom/ChatroomForm';
import { onEvent, offEvent } from '../services/socket';

// Simple JoinForm inline to avoid extra file
const JoinForm = ({ onJoin }: { onJoin: (nameOrId: string) => void }) => {
  const [value, setValue] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (value.trim()) onJoin(value.trim()); }} className="flex gap-2">
      <input value={value} onChange={e => setValue(e.target.value)} placeholder="Chatroom id" className="flex-1 px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white/90 text-gray-900" />
      <button className="bg-purple-500 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-purple-600">Join</button>
    </form>
  );
};

const HomePage = () => {
  const navigate = useNavigate();
  const [chatrooms, setChatrooms] = useState([
    // initial placeholder until loaded from backend
    { id: 'loading', name: 'Loading...', lastMessage: '' },
  ]);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // add current user state
  const [currentUser, setCurrentUser] = useState<any>(null);
  const backendBase = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

  useEffect(() => {
    // populate initial from localStorage to avoid flicker
    try {
      const raw = window.localStorage.getItem('user');
      if (raw) {
        const u = JSON.parse(raw);
        // normalize avatar url
        const avatar = u?.avatarUrl || u?.avatar || '';
        const abs = avatar && avatar.startsWith('/uploads') ? `${backendBase}${avatar}` : avatar || '';
        setCurrentUser({ id: u.id, email: u.email, displayName: u.displayName || u.name || '', username: u.username, avatarUrl: abs });
      }
    } catch (e) {}

    // refresh from backend for accuracy
    api.getMe()
      .then((res: any) => {
        if (res) {
          const avatar = res.avatarUrl || '';
          const abs = avatar && avatar.startsWith('/uploads') ? `${backendBase}${avatar}` : avatar || '';
          setCurrentUser({ id: res.id, email: res.email, displayName: res.displayName || '', username: res.username, avatarUrl: abs });
          try { window.localStorage.setItem('user', JSON.stringify({ id: res.id, email: res.email, displayName: res.displayName, username: res.username, avatarUrl: res.avatarUrl })); } catch (e) {}
        }
      })
      .catch(() => {
        // ignore: allow anonymous view (logout link still present)
      });
  }, []);

  // allow closing modals with Escape key for better UX
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowCreate(false);
        setShowJoin(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    // load chatrooms from backend
    api.getChatrooms()
      .then((list: any[]) => setChatrooms(list))
      .catch(err => {
        console.warn('Failed to fetch chatrooms, using demo data', err);
        setChatrooms([
          { id: '1', name: 'CHATROOM 1', lastMessage: 'tina: hi!' },
          { id: '2', name: 'CHATROOM 2', lastMessage: 'tina: hi!' },
        ]);
      });
  }, []);

  // subscribe to realtime socket events and refresh the room list when things change
  useEffect(() => {
    const refresh = async () => {
      try {
        const list: any[] = await api.getChatrooms();
        setChatrooms(list);
      } catch (err) {
        console.warn('Failed to refresh chatrooms on socket event', err);
      }
    };

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
    ];

    for (const ev of events) {
      onEvent(ev, refresh);
    }

    return () => {
      for (const ev of events) {
        offEvent(ev, refresh);
      }
    };
  }, []);

  // small helper to show temporary toasts
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleCreate = (name: string) => {
    // call backend to create chatroom (requires auth token)
    api.createChatroom({ name })
      .then(async (res: any) => {
        const id = res.id;
        setChatrooms(prev => [{ id, name, lastMessage: '' }, ...prev]);
        setShowCreate(false);
        // copy id to clipboard for easy sharing
        try {
          await navigator.clipboard.writeText(id);
          setToast(`Chatroom created. ID copied to clipboard: ${id}`);
          // navigate into the newly created chatroom
          navigate(`/chatroom/${id}`);
        } catch (err) {
          // fallback: show id so user can copy manually
          setToast(`Chatroom created. ID: ${id}`);
          navigate(`/chatroom/${id}`);
        }
      })
      .catch((err: any) => {
        console.error(err);
        setToast('Failed to create chatroom. Make sure you are logged in.');
      });
  };

  const handleJoin = async (nameOrId: string) => {
    try {
      const res: any = await api.joinChatroom(nameOrId);
      if (!res || !res.ok) {
        // show friendly messages
        const err = res?.error || 'Failed to join chatroom';
        return setToast(err === 'not-found' ? 'Chatroom not found' : err === 'invalid-id' ? 'Invalid chatroom id' : String(err));
      }
      // refresh user's chatrooms list
      const list: any[] = await api.getChatrooms();
      setChatrooms(list);
      setShowJoin(false);
      // navigate to the joined chatroom
      navigate(`/chatroom/${res.id}`);
    } catch (err) {
      console.error(err);
      setToast('Failed to join chatroom. Make sure the ID is correct and you are logged in.');
    }
  };

  const handleCopyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setToast('Chatroom ID copied to clipboard');
    } catch (err) {
      setToast(`ID: ${id}`);
    }
  };

  return (
    <div className="h-full w-full flex">
      {/* Sidebar (profile & actions) */}
      <aside className="w-80 bg-white/80 flex flex-col items-center py-6 shadow-2xl border-r border-blue-200 h-full">
        <Link to="/profile" className="flex flex-col items-center gap-2 mb-6 no-underline">
          <div className="w-24 h-24 rounded-full bg-blue-200 flex items-center justify-center font-bold text-blue-700 text-xs transition-transform hover:scale-105 hover:ring-4 hover:ring-blue-400/30 focus:outline-none focus:ring-4 focus:ring-blue-400/50 overflow-hidden">
            {currentUser?.avatarUrl ? (
              <img src={currentUser.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl">{(currentUser?.displayName || currentUser?.username || 'U')[0]?.toUpperCase() || 'U'}</span>
            )}
          </div>
          <div className="text-blue-700 text-sm font-semibold mt-1">{currentUser?.username || currentUser?.displayName || 'Guest'}</div>
        </Link>
        <div className="flex flex-col gap-4 w-full px-4 mb-8">
          <button onClick={() => setShowCreate(true)} className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold shadow hover:bg-blue-700 transition">Create a chatroom</button>
          <button onClick={() => setShowJoin(true)} className="w-full bg-purple-500 text-white py-2 rounded-lg font-bold shadow hover:bg-purple-600 transition">Join a chatroom</button>
        </div>
        <div className="text-blue-700 text-sm cursor-pointer mt-auto mb-2">
          <Link to="/login" className="hover:underline">Logout</Link>
        </div>
      </aside>
      {/* Main content (chatroom list) */}
      <main className="flex-1 flex flex-col items-center py-6 px-4 overflow-auto h-full">
        <h1 className="text-3xl font-extrabold text-white mb-5 tracking-wide">Chatrooms</h1>

        <ul className="w-full max-w-2xl space-y-6">
          {chatrooms.map((room) => (
            <li key={room.id} className="flex items-center bg-white/90 rounded-xl px-6 py-4 shadow hover:shadow-lg transition cursor-pointer hover:bg-blue-100 focus:bg-blue-200 outline-none">
              <Link to={`/chatroom/${room.id}`} className="flex-1 min-w-0">
                <div className="font-bold text-lg text-gray-800 truncate">{room.name}</div>
                <div className="text-gray-600 text-sm truncate">{room.lastMessage}</div>
              </Link>
              <div className="flex items-center gap-3 pl-4">
                <button onClick={() => handleCopyId(room.id)} className="text-sm bg-gray-100 px-3 py-1 rounded-md hover:bg-gray-200">Copy ID</button>
                <div className="w-3 h-3 rounded-full bg-green-400"></div>
              </div>
            </li>
          ))}
        </ul>
      </main>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-md mx-4">
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Create a chatroom</h3>
                <button className="text-gray-500 hover:text-gray-700" onClick={() => setShowCreate(false)} aria-label="Close">×</button>
              </div>
              <ChatroomForm onCreate={handleCreate} />
            </div>
          </div>
        </div>
      )}

      {/* Join Modal */}
      {showJoin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowJoin(false)} />
          <div className="relative w-full max-w-md mx-4">
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Join a chatroom</h3>
                <button className="text-gray-500 hover:text-gray-700" onClick={() => setShowJoin(false)} aria-label="Close">×</button>
              </div>
              <JoinForm onJoin={handleJoin} />
            </div>
          </div>
        </div>
      )}

      {/* simple toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-4 py-2 rounded-md shadow-lg">{toast}</div>
      )}

    </div>
  );
};

export default HomePage;
