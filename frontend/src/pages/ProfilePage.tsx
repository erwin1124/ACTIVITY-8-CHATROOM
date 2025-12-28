import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';

type Profile = {
  name: string;
  email: string;
  username: string;
  avatar?: string;
};

const ProfilePage = () => {
  // Try to load persisted profile from localStorage or backend
  const stored = typeof window !== 'undefined' ? window.localStorage.getItem('demo_profile') : null;
  const storedUser = typeof window !== 'undefined' ? window.localStorage.getItem('user') : null;

  // Normalize initial profile so fields are always strings (prevents uncontrolled->controlled warnings)
  let initial: Profile;
  if (stored) {
    try {
      const p = JSON.parse(stored || '{}');
      initial = {
        name: String(p.name || p.displayName || ''),
        email: String(p.email || ''),
        username: String(p.username || ''),
        avatar: String(p.avatar || p.avatarUrl || ''),
      };
    } catch (e) {
      initial = { name: '', email: '', username: '', avatar: '' };
    }
  } else if (storedUser) {
    try {
      const u = JSON.parse(storedUser || '{}');
      initial = {
        name: String(u.displayName || u.name || ''),
        email: String(u.email || ''),
        username: String(u.username || ''),
        avatar: String(u.avatarUrl || u.avatar || ''),
      };
    } catch (e) {
      initial = { name: '', email: '', username: '', avatar: '' };
    }
  } else {
    initial = { name: 'John Doe', email: 'john@example.com', username: 'johndoe', avatar: '' };
  }

  const [profile, setProfile] = useState<Profile>(initial);
  const [editing, setEditing] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(initial.avatar || null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  const backendBase = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

  useEffect(() => {
    // persist demo profile
    try {
      window.localStorage.setItem('demo_profile', JSON.stringify(profile));
    } catch (e) {}
  }, [profile]);

  useEffect(() => {
    // on mount try to fetch current profile from backend if not using demo profile
    if (!stored) {
      api.getMe().then((res: any) => {
        if (res) {
          setProfile({ name: res.displayName || '', email: res.email || '', username: res.username || '', avatar: res.avatarUrl || '' });
          try {
            window.localStorage.setItem(
              'user',
              JSON.stringify({ id: res.id, email: res.email, displayName: res.displayName, username: res.username, avatarUrl: res.avatarUrl })
            );
          } catch (e) {}
        }
      }).catch(() => { /* ignore */ });
    }
  }, []);

  useEffect(() => {
    // generate preview from selected file
    if (!avatarFile) return;
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  // on mount normalize stored avatar if present
  useEffect(() => {
    if (profile.avatar && profile.avatar.startsWith('/uploads')) {
      const abs = profile.avatar.startsWith('http') ? profile.avatar : `${backendBase}${profile.avatar}`;
      setProfile(p => ({ ...p, avatar: abs }));
      setAvatarPreview(abs);
    }
  }, []);

  const onChange = (field: keyof Profile, value: string) => {
    setProfile((prev: Profile) => ({ ...prev, [field]: value } as Profile));
  };

  const handleChooseAvatar = () => fileRef.current?.click();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setAvatarFile(f);
    if (!f) setAvatarPreview(profile.avatar || null);
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setProfile((prev: Profile) => ({ ...prev, avatar: '' }));
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    // Basic validation
    if (!profile.name.trim()) return alert('Please enter your name');
    if (!profile.username.trim()) return alert('Please enter a username');

    setSaving(true);
    setToast('Saving...');
    console.log('[ProfilePage] handleSave start', { profile, avatarFile, avatarPreview });

    try {
      let avatarUrlToSave = profile.avatar || '';

      // if there's a new file selected, upload it first
      if (avatarFile) {
        try {
          console.log('[ProfilePage] uploading avatar file', avatarFile.name, avatarFile.type, avatarFile.size);
          const form = new FormData();
          form.append('files', avatarFile);
          const uploadRes: any = await api.uploadFiles(form);
          console.log('[ProfilePage] uploadRes', uploadRes);
          // support response shape: { files: [{ url, originalName, ... }] }
          if (uploadRes && Array.isArray(uploadRes.files) && uploadRes.files.length > 0) {
            const returned = uploadRes.files[0].url || avatarUrlToSave;
            // make absolute so browser will request from backend, not from Vite dev server
            avatarUrlToSave = returned.startsWith('http') ? returned : `${backendBase}${returned}`;
          }
        } catch (upErr) {
          console.error('Failed to upload avatar', upErr);
          setToast('Failed to upload avatar');
          alert('Failed to upload avatar image');
          setSaving(false);
          return; // don't continue saving profile without successful upload
        }
      }

      console.log('[ProfilePage] calling updateMe with avatarUrl', avatarUrlToSave);
      const body = { displayName: profile.name, username: profile.username, avatarUrl: avatarUrlToSave };
      const res: any = await api.updateMe(body);
      console.log('[ProfilePage] updateMe res', res);
      if (res) {
        const absAvatar = res.avatarUrl && !res.avatarUrl.startsWith('http') ? `${backendBase}${res.avatarUrl}` : res.avatarUrl || '';
        setProfile({ name: res.displayName || '', email: res.email || '', username: res.username || '', avatar: absAvatar });
        try {
          window.localStorage.setItem(
            'user',
            JSON.stringify({ id: res.id, email: res.email, displayName: res.displayName, username: res.username, avatarUrl: absAvatar })
          );
        } catch (e) {}
        setEditing(false);
        setAvatarFile(null);
        setAvatarPreview(absAvatar || null);
        setToast('Profile saved');
        alert('Profile saved');
      }
    } catch (err) {
      console.error(err);
      setToast('Failed to save profile');
      alert('Failed to save profile');
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 2500);
    }
  };

  const handleLogout = () => {
    // Demo logout: clear storage and navigate to login
    window.localStorage.removeItem('demo_profile');
    navigate('/login');
  };

  const handleDeleteAccount = () => {
    if (confirm('Delete your account? This is a demo and will clear local data.')) {
      window.localStorage.removeItem('demo_profile');
      alert('Account deleted (demo)');
      navigate('/signup');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white/95 p-8 rounded-2xl shadow-2xl flex flex-col items-center">
        <Link to="/home" className="self-start text-blue-500 text-2xl mb-4 hover:text-blue-700 transition">&larr; Back</Link>

        <form onSubmit={handleSave} className="w-full">
          <div className="flex flex-col items-center">
            {/* fixed-height avatar area so toggling edit buttons doesn't shift layout */}
            <div className="relative w-full flex flex-col items-center" aria-live="polite">
              {/* fixed-height avatar area to avoid layout shifts when toggling edit mode */}
              <div className="flex flex-col items-center justify-center h-44">
                <div className="w-28 h-28 rounded-full bg-blue-300 flex items-center justify-center font-bold text-blue-700 text-3xl shadow-lg overflow-hidden">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span>{profile.name?.[0]?.toUpperCase() || 'U'}</span>
                  )}
                </div>

                <input type="file" accept="image/*" className="hidden" ref={fileRef} onChange={handleFile} />

                <div className="flex gap-2 justify-center mt-4 min-h-[40px]">
                  {editing ? (
                    <>
                      <button type="button" onClick={handleChooseAvatar} className="bg-white border border-gray-200 px-3 py-2 rounded-lg">Change Avatar</button>
                      <button type="button" onClick={handleRemoveAvatar} className="bg-red-50 text-red-600 px-3 py-2 rounded-lg border border-red-100">Remove</button>
                    </>
                  ) : (
                    <div className="h-10" aria-hidden="true" />
                  )}
                </div>
              </div>
            </div>
          </div>

            <div className="w-full mt-6">
              <label className="block text-sm font-medium text-gray-700">Full name</label>
              <input
                className="w-full mt-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={profile.name}
                onChange={e => onChange('name', e.target.value)}
                disabled={!editing}
              />

              <label className="block text-sm font-medium text-gray-700 mt-4">Username</label>
              <input
                className="w-full mt-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={profile.username}
                onChange={e => onChange('username', e.target.value)}
                disabled={!editing}
              />

              <label className="block text-sm font-medium text-gray-700 mt-4">Email</label>
              <input
                className="w-full mt-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={profile.email}
                onChange={e => onChange('email', e.target.value)}
                disabled={!editing}
                type="email"
              />

              <div className="flex items-center justify-between mt-6 gap-4">
                {editing ? (
                  <div className="flex gap-3">
                    <button type="submit" disabled={saving} className="bg-blue-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-blue-700">Save</button>
                    <button type="button" onClick={() => { setEditing(false); setAvatarFile(null); setAvatarPreview(profile.avatar || null); }} className="bg-gray-100 px-4 py-2 rounded-lg">Cancel</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setEditing(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-blue-700">Edit Profile</button>
                )}

                <div className="flex gap-2">
                  <button type="button" onClick={handleLogout} className="bg-white border border-gray-200 px-4 py-2 rounded-lg">Logout</button>
                  <button type="button" onClick={handleDeleteAccount} className="bg-red-600 text-white px-4 py-2 rounded-lg">Delete account</button>
                </div>
              </div>
            </div>
        </form>
      </div>
      {/* simple toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-4 py-2 rounded-md shadow-lg">{toast}</div>
      )}
    </div>
  );
};

export default ProfilePage;
