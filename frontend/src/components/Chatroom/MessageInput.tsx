import { useState, useRef, useEffect } from 'react';
import { api } from '../../services/api';

type PreviewItem = {
  id: string;
  file: File;
  url: string;
  type: 'image' | 'video' | 'document';
  name: string;
};

const MessageInput = ({ chatroomId }: { chatroomId?: string }) => {
  const [text, setText] = useState('');
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    // Auto-resize textarea when text changes
    if (textareaRef.current) {
      textareaRef.current.style.height = '0px';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [text, previews.length]);

  useEffect(() => {
    // Cleanup object URLs on unmount
    return () => {
      previews.forEach(p => URL.revokeObjectURL(p.url));
    };
  }, [previews]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newPreviews = files.map(file => {
      const url = URL.createObjectURL(file);
      const type = file.type.startsWith('image')
        ? 'image'
        : file.type.startsWith('video')
        ? 'video'
        : 'document';
      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
        url,
        type,
        name: file.name,
      } as PreviewItem;
    });

    // Append to existing previews
    setPreviews(prev => [...prev, ...newPreviews]);

    // Reset native input so the same file can be reselected later if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePreview = (id: string) => {
    setPreviews(prev => {
      const removed = prev.find(p => p.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      return prev.filter(p => p.id !== id);
    });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatroomId) {
      alert('No chatroom selected');
      return;
    }

    setUploading(true);
    try {
      const attachments: any[] = [];
      if (previews.length > 0) {
        const form = new FormData();
        previews.forEach(p => form.append('files', p.file));
        const res: any = await api.uploadFiles(form);
        // res.files -> [{ url, originalName }]
        (res.files || []).forEach((f: any) => attachments.push({ url: f.url, name: f.originalName }));
      }

      // send message to backend which will attach user from JWT
      const res = await api.sendMessage(chatroomId, {
        text: text.trim() || null,
        attachments: attachments.length > 0 ? attachments : null,
      });

      // optimistic UI: dispatch an event with the sent message so MessageList can append immediately
      try {
        const token = localStorage.getItem('token');
        let uid: string | null = null;
        let userName: string | undefined;
        if (token) {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            uid = payload?.uid || payload?.sub || null;
            userName = payload?.displayName || payload?.email || payload?.username;
          }
        }

        const optimisticMsg: any = {
          id: (res && (res.id || res._id)) || `local-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
          chatroomId,
          text: text.trim() || null,
          userId: uid,
          userName: userName || 'You',
          attachments: attachments.length > 0 ? attachments : undefined,
          reactions: {},
          createdAt: new Date().toISOString(),
        };
        window.dispatchEvent(new CustomEvent('chat:message:sent', { detail: optimisticMsg }));
      } catch (e) {
        // ignore optimistic dispatch errors
      }

      // cleanup
      previews.forEach(p => URL.revokeObjectURL(p.url));
      setPreviews([]);
      setText('');
    } catch (err) {
      console.error(err);
      alert('Failed to send message');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="w-full py-2">
      <form onSubmit={handleSend} className="flex items-end gap-3">
        {/* Typebox card */}
        <div className="flex-1 bg-white/95 border border-gray-200 rounded-2xl shadow-sm p-3">
          {/* Preview strip (shows when files are attached) */}
          {previews.length > 0 && (
            <div className="mb-3">
              <div className="flex gap-3 overflow-x-auto py-1">
                {previews.map(p => (
                  <div key={p.id} className="relative flex-shrink-0 w-28">
                    <div className="w-28 h-20 bg-gray-100 rounded-md overflow-hidden border">
                      {p.type === 'image' ? (
                        <img src={p.url} alt={p.name} className="w-full h-full object-cover" />
                      ) : p.type === 'video' ? (
                        <video src={p.url} className="w-full h-full object-cover" muted />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center px-2">
                          <div className="text-sm text-gray-700 text-center">
                            <div className="font-medium">{p.name}</div>
                            <div className="text-xs text-gray-500 mt-1">Document</div>
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removePreview(p.id)}
                      className="absolute -top-2 -right-2 bg-white text-red-500 rounded-full p-1 shadow border"
                      aria-label={`Remove ${p.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Textarea and input row */}
          <div className="flex items-end gap-3">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={uploading ? 'Uploading...' : 'Type your message...'}
              rows={1}
              className="resize-none overflow-hidden bg-transparent w-full text-gray-900 placeholder-gray-400 focus:outline-none text-sm"
              aria-label="Message input"
              disabled={uploading}
            />
          </div>
        </div>

        {/* Controls */}
        <input
          type="file"
          accept="image/*,video/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/zip"
          className="hidden"
          ref={fileInputRef}
          multiple
          onChange={handleFileChange}
          disabled={uploading}
        />
        <button
          type="button"
          className="bg-white border border-gray-200 p-2 rounded-md shadow-sm hover:bg-gray-50"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach files"
          disabled={uploading}
        >
          📎
        </button>

        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded-md font-semibold shadow hover:bg-blue-700 disabled:opacity-50"
          disabled={!(text.trim() || previews.length > 0) || uploading}
        >
          {uploading ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
};

export default MessageInput;
