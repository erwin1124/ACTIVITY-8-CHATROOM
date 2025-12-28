import './App.css'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ChatroomPage from './pages/ChatroomPage';
import ProfilePage from './pages/ProfilePage';
import { connectSocket, disconnectSocket } from './services/socket';
import { api } from './services/api';

function App() {
  // initialize from localStorage synchronously to avoid render flicker
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem('token'));
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let socket: any = null;

    async function init() {
      const token = localStorage.getItem('token');
      if (!token) {
        setIsLoggedIn(false);
        setInitializing(false);
        return;
      }

      try {
        // validate token and fetch current user
        const me: any = await api.getMe();
        if (me && me.id) {
          try { localStorage.setItem('user', JSON.stringify(me)); } catch (e) {}
          setIsLoggedIn(true);
          socket = connectSocket(token);
        } else {
          // invalid token
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setIsLoggedIn(false);
        }
      } catch (err) {
        // token invalid or network error -> clear and require login
        console.warn('Auth validation failed', err);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setIsLoggedIn(false);
      } finally {
        setInitializing(false);
      }
    }

    init();

    // listen for storage changes (other tabs) to update auth state
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'token') {
        const t = localStorage.getItem('token');
        setIsLoggedIn(!!t);
        if (t) connectSocket(t);
        else disconnectSocket();
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('storage', onStorage);
      if (!socket) disconnectSocket();
    };
  }, []);

  if (initializing) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage setIsLoggedIn={setIsLoggedIn} />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/home" element={isLoggedIn ? <HomePage /> : <Navigate to="/login" replace />} />
        <Route path="/chatroom/:id" element={isLoggedIn ? <ChatroomPage /> : <Navigate to="/login" replace />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>
    </Router>
  );
}

export default App;
