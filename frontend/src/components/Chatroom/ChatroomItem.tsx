type ChatroomItemProps = {
  name: string;
  joined: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onDelete: () => void;
};

const ChatroomItem = ({ name, joined, onJoin, onLeave, onDelete }: ChatroomItemProps) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span>{name}</span>
      {!joined ? (
        <button onClick={onJoin}>Join</button>
      ) : (
        <button onClick={onLeave}>Leave</button>
      )}
      <button onClick={onDelete} style={{ color: 'red' }}>Delete</button>
    </div>
  );
};
export default ChatroomItem;
