import { Link, useParams } from 'react-router-dom';
import ChatroomHeader from '../components/Chatroom/ChatroomHeader';
import MessageList from '../components/Chatroom/MessageList';
import MessageInput from '../components/Chatroom/MessageInput';

const ChatroomPage = () => {
  const { id } = useParams();
  const chatroomId = id || 'default';

  return (
    <div className="h-full w-full flex flex-col">
      <div className="w-full max-w-6xl mx-auto flex flex-col flex-1 py-4 px-4 h-full">
        <Link to="/home" className="self-start text-white text-2xl mb-2 hover:text-blue-700 transition">&larr; Back to Chatrooms</Link>
        <ChatroomHeader chatroomId={chatroomId} />
        {/* Make the chat area take the full available width (removed right-side user list)
            Simplified structure: MessageList is the flexible scroll area and MessageInput sits directly below it. */}
        <div className="mt-2 flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0">
            <MessageList chatroomId={chatroomId} />
          </div>
          <div className="mt-0">
            <MessageInput chatroomId={chatroomId} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatroomPage;
