import { useState } from 'react';

// Form to create a new chatroom
const ChatroomForm = ({ onCreate }: { onCreate: (name: string) => void }) => {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onCreate(name.trim());
      setName('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
      <input
        type="text"
        placeholder="New chatroom name"
        value={name}
        onChange={e => setName(e.target.value)}
        className="flex-1 px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50 text-gray-900"
        required
      />
      <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-blue-700 transition-all duration-200">Create</button>
    </form>
  );
};
export default ChatroomForm;
