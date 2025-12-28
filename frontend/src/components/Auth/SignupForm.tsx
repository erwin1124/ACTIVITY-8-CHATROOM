import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../services/api';

const SignupForm = () => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const navigate = useNavigate();

  // simple email format check
  const isValidEmail = (e: string) => /\S+@\S+\.\S+/.test(e);

  // debounce and check availability for email
  useEffect(() => {
    setEmailAvailable(null);
    if (!email || !isValidEmail(email)) return;
    setCheckingEmail(true);
    const t = setTimeout(async () => {
      try {
        const users: any[] = await api.getUsers();
        const found = users.find(u => String(u.email).toLowerCase() === email.toLowerCase());
        setEmailAvailable(!Boolean(found));
      } catch (err) {
        // on error, clear availability so we don't block signup
        setEmailAvailable(null);
      } finally {
        setCheckingEmail(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [email]);

  // debounce and check availability for username
  useEffect(() => {
    setUsernameAvailable(null);
    if (!username || username.trim().length < 2) return;
    setCheckingUsername(true);
    const t = setTimeout(async () => {
      try {
        const users: any[] = await api.getUsers();
        const found = users.find(u => String(u.username || '').toLowerCase() === username.toLowerCase());
        setUsernameAvailable(!Boolean(found));
      } catch (err) {
        setUsernameAvailable(null);
      } finally {
        setCheckingUsername(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setError(null);
    // basic validations
    if (!email || !password) return setError('Email and password required');
    if (!isValidEmail(email)) return setError('Please enter a valid email');
    if (emailAvailable === false) return setError('Email is already in use');
    if (usernameAvailable === false) return setError('Username is already in use');

    try {
      const res: any = await api.signup({ email, password, displayName: `${firstName} ${lastName}`, username });
      if (res?.token) {
        localStorage.setItem('token', res.token);
        try { if (res.user) localStorage.setItem('user', JSON.stringify(res.user)); } catch(e) {}
        navigate('/home');
      } else {
        setError('Signup failed');
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Signup failed');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center">
      <div className="w-full max-w-md bg-white/90 p-8 rounded-2xl shadow-2xl flex flex-col items-center">
        <div className="w-full flex items-center mb-2">
          <Link to="/login" className="text-blue-500 text-2xl hover:text-blue-700 transition">&larr;</Link>
        </div>
        <h1 className="text-3xl font-extrabold text-center mb-8 text-gray-800 tracking-wide w-full">Sign Up</h1>
        <form onSubmit={handleSubmit} className="w-full">
          {/* First and Last name on one row */}
          <div className="mb-6 flex gap-3">
            <div className="flex-1">
              <label className="block text-gray-700 mb-2 font-semibold" htmlFor="firstName">First name</label>
              <input
                type="text"
                id="firstName"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50 text-gray-900"
                required
                placeholder='First name'
              />
            </div>
            <div className="flex-1">
              <label className="block text-gray-700 mb-2 font-semibold" htmlFor="lastName">Last name</label>
              <input
                type="text"
                id="lastName"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50 text-gray-900"
                required
                placeholder='Last name'
              />
            </div>
          </div>
          <div className="mb-6">
            <label className="block text-gray-700 mb-2 font-semibold" htmlFor="email">E-mail</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50 text-gray-900"
              required
              autoComplete="email"
              placeholder='Enter your email'
            />
            {checkingEmail && <div className="text-sm text-gray-500 mt-1">Checking...</div>}
            {emailAvailable === false && !checkingEmail && <div className="text-sm text-red-600 mt-1">Email already in use</div>}
            {emailAvailable === true && !checkingEmail && <div className="text-sm text-green-600 mt-1">Email available</div>}
          </div>
          <div className="mb-6">
            <label className="block text-gray-700 mb-2 font-semibold" htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50 text-gray-900"
              required
              autoComplete="username"
              placeholder='Create a username'
            />
            {checkingUsername && <div className="text-sm text-gray-500 mt-1">Checking...</div>}
            {usernameAvailable === false && !checkingUsername && <div className="text-sm text-red-600 mt-1">Username already in use</div>}
            {usernameAvailable === true && !checkingUsername && <div className="text-sm text-green-600 mt-1">Username available</div>}
          </div>
          <div className="mb-8">
            <label className="block text-gray-700 mb-2 font-semibold" htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50 text-gray-900"
              required
              autoComplete="new-password"
              placeholder='Create a password'
            />
          </div>
          <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold text-lg shadow hover:bg-blue-700 transition-all duration-200 mb-2">Create</button>
          {error && <div className="text-red-600 mt-2 text-sm">{error}</div>}
        </form>
      </div>
    </div>
  );
};
export default SignupForm;
