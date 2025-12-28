import ChatroomItem from './ChatroomItem';
import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { api } from '../../services/api';

type Chatroom = { id: string; name: string };
type ChatroomListProps = {
  chatrooms: Chatroom[];
  setChatrooms: Dispatch<SetStateAction<Chatroom[]>>;
};

const ChatroomList = ({ chatrooms, setChatrooms }: ChatroomListProps) => {
  const [joined, setJoined] = useState<string[]>([]);
  const [joinInput, setJoinInput] = useState('');

  const handleJoinById = async () => {
    if (!joinInput.trim()) return;
    try {
      await api.joinChatroom(joinInput.trim());
      // refresh list from backend
      const list: any[] = await api.getChatrooms();
      setChatrooms(list);
      setJoinInput('');
    } catch (err) {
      console.error(err);
      alert('Failed to join chatroom. Ensure the ID is correct and you are logged in.');
    }
  };

  const handleJoin = (id: string) => {
    setJoined([...joined, id]);
  };
  const handleLeave = (id: string) => {
    setJoined(joined.filter(jid => jid !== id));
  };
  const handleDelete = (id: string) => {
    setChatrooms(chatrooms.filter(c => c.id !== id));
    setJoined(joined.filter(jid => jid !== id));
  };

  return (
    <div>
      <h3>Chatrooms</h3>
      <div className="mb-3 flex gap-2">
        <input value={joinInput} onChange={e => setJoinInput(e.target.value)} placeholder="Enter chatroom ID to join" />
        <button onClick={handleJoinById}>Join by ID</button>
      </div>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {chatrooms.map(room => (
          <li key={room.id} style={{ marginBottom: 8 }}>
            <ChatroomItem
              name={room.name}
              joined={joined.includes(room.id)}
              onJoin={() => handleJoin(room.id)}
              onLeave={() => handleLeave(room.id)}
              onDelete={() => handleDelete(room.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
};
export default ChatroomList;
