let io: any = null;

export function initSocket(server: any, opts: any = {}) {
  if (io) return io;
  // lazy require to avoid top-level type issues
  const { Server } = require('socket.io');
  const jwt = require('jsonwebtoken');

  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_ORIGIN || '*',
      methods: ['GET', 'POST'],
    },
    ...opts,
  });

  io.use((socket: any, next: any) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split?.(' ')?.[1];
    if (!token) return next();
    try {
      const secret = process.env.JWT_SECRET || 'dev-secret';
      const decoded = jwt.verify(token, secret) as any;
      socket.user = decoded;
      return next();
    } catch (err) {
      console.warn('[socket] invalid token', err);
      return next();
    }
  });

  io.on('connection', (socket: any) => {
    console.log('[socket] client connected', socket.id, socket.user ? socket.user.uid : '(no user)');
    // notify others that this user is online
    if (socket.user) {
      io.emit('user:online', { uid: socket.user.uid, displayName: socket.user.displayName || socket.user.email });
    }

    socket.on('join', (room: string) => {
      socket.join(room);
      if (socket.user) io.to(room).emit('chatroom:member:joined', { chatroomId: room, userId: socket.user.uid, user: socket.user });
    });
    socket.on('leave', (room: string) => {
      socket.leave(room);
      if (socket.user) io.to(room).emit('chatroom:member:left', { chatroomId: room, userId: socket.user.uid, user: socket.user });
    });
    socket.on('disconnect', () => {
      if (socket.user) {
        io.emit('user:offline', { uid: socket.user.uid });
      }
    });
  });

  return io;
}

export function getIO() {
  if (!io) {
    console.warn('[socket] io not initialized yet');
    return null;
  }
  return io;
}
