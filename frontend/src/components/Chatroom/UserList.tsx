import { useEffect, useState } from 'react';
import { api } from '../../services/api';

const UserList = () => {
  const [users, setUsers] = useState<Array<{ id: string; displayName?: string; username?: string; email?: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.getUsers().then((res: any) => {
      setUsers(res || []);
    }).catch(err => {
      console.error('Failed to load users', err);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-white/90 rounded-xl shadow p-4">
      <h4 className="font-bold text-blue-700 mb-2">Users</h4>
      {loading ? <div className="text-sm text-gray-500">Loading...</div> : (
        <ul className="list-none p-0 space-y-1">
          {users.map(user => (
            <li key={user.id} className="text-gray-800">{user.displayName || user.username || user.email || 'Unknown'}</li>
          ))}
        </ul>
      )}
    </div>
  );
};
export default UserList;
