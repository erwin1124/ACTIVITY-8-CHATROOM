import { useState, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';

const LoginForm = ({ setIsLoggedIn }: { setIsLoggedIn: Dispatch<SetStateAction<boolean>> }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setForgotOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) return;
    try {
      const res: any = await api.login({ email, password });
      if (res?.token) {
        localStorage.setItem('token', res.token);
        try { if (res.user) localStorage.setItem('user', JSON.stringify(res.user)); } catch(e) {}
        setIsLoggedIn(true);
        navigate('/home');
      } else {
        alert('Login failed');
      }
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Login failed');
    }
  };

  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return alert('Please enter your email');
    // Mock sending reset link
    alert(`Password reset link sent to ${forgotEmail} (demo)`);
    setForgotEmail('');
    setForgotOpen(false);
  };

  return (
    // Only render the form card; page-level layout (background/centering) is handled by LoginPage
    <div className="w-full max-w-md bg-white/90 p-8 rounded-2xl shadow-2xl border border-blue-200 flex flex-col items-center shadow-3xl">
      {/* Logo/Icon placeholder */}
      <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center mb-4 shadow-lg">
        <span className="text-white text-3xl font-bold">💬</span>
      </div>
      <h2 className="text-3xl font-extrabold text-center mb-8 text-gray-800 tracking-wide">Login</h2>
      <form onSubmit={handleSubmit} className="w-full">
        <div className="mb-6">
          <label className="block text-gray-700 mb-2 font-semibold" htmlFor="email">E-mail</label>
          <input
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50 text-gray-900"
            type="email"
            id="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder='Enter your email'
          />
        </div>
        <div className="mb-6">
          <label className="block text-gray-700 mb-2 font-semibold" htmlFor="password">Password</label>
          <input
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50 text-gray-900"
            type="password"
            id="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder='Enter your password'
          />
        </div>
        <div className="flex justify-between items-center mb-6">
          <button type="button" onClick={() => setForgotOpen(true)} className="text-sm text-blue-600 hover:underline">Forgot password?</button>
          <Link to="/signup" className="text-sm text-blue-600 hover:underline">Create account</Link>
        </div>
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold text-lg shadow hover:bg-blue-700 transition-all duration-200"
        >
          Login
        </button>
      </form>

      {/* Forgot Password Modal */}
      {forgotOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setForgotOpen(false)} />
          <div className="relative w-full max-w-md mx-4">
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Reset password</h3>
                <button className="text-gray-500 hover:text-gray-700" onClick={() => setForgotOpen(false)} aria-label="Close">×</button>
              </div>
              <p className="text-sm text-gray-600 mb-4">Enter your account email and we'll send a password reset link.</p>
              <form onSubmit={handleForgotSubmit}>
                <label className="block text-gray-700 mb-2 font-semibold" htmlFor="forgotEmail">E-mail</label>
                <input
                  id="forgotEmail"
                  type="email"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50 text-gray-900 mb-4"
                  placeholder="Enter your email"
                  required
                />
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setForgotOpen(false)} className="px-4 py-2 rounded-lg border">Cancel</button>
                  <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white">Send reset link</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default LoginForm;
