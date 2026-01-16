import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import mongoose from 'mongoose';
import { getIO } from '../../socket';

const MessageSchema = new mongoose.Schema({
  chatroomId: String,
  text: String,
  userId: String,
  userName: String,
  attachments: Array,
  reactions: { type: Map, of: String },
  createdAt: { type: Date, default: Date.now },
  deleted: { type: Boolean, default: false },
  deletedBy: { type: String, default: null },
});
const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema);

// NEW: minimal Chatroom model so we can enforce membership
const ChatroomSchema =
  (mongoose.models.Chatroom && (mongoose.models.Chatroom as any).schema) ||
  new mongoose.Schema(
    {
      name: String,
      ownerId: String,
      members: [String],
      createdAt: { type: Date, default: Date.now },
    },
    { collection: 'chatrooms' } // optional; safe even if collection name differs
  );
const Chatroom = mongoose.models.Chatroom || mongoose.model('Chatroom', ChatroomSchema);

// helper: safely fetch user metadata (displayName, avatarUrl) if User model is available
async function fetchUserMeta(userId: string) {
  if (!userId) return null;
  try {
    const User = (mongoose.models && (mongoose.models.User as any)) || null;
    if (!User) return null;
    const u: any = await User.findById(userId).select('displayName avatarUrl').lean();
    if (!u) return null;
    return { displayName: u.displayName, avatarUrl: u.avatarUrl };
  } catch (e) {
    return null;
  }
}

@Injectable()
export class MessagesService {
  async send(chatroomId: string, body: any) {
    // NEW: defensive checks
    const uid = String(body?.userId || '');
    if (!chatroomId) throw new BadRequestException('chatroomId required');
    if (!uid) throw new BadRequestException('userId required');

    // NEW: enforce membership (prevents kicked users from sending)
    const room: any = await Chatroom.findById(chatroomId).select('members').lean();
    if (!room) throw new NotFoundException('Chatroom not found');

    const members: string[] = (room.members || []).map((m: any) => String(m));
    if (!members.includes(uid)) {
      throw new ForbiddenException('You are not a member of this chatroom');
    }

    const doc: any = await Message.create({
      chatroomId,
      text: body.text || null,
      userId: body.userId || null,
      userName: body.userName || null,
      attachments: body.attachments || null,
      reactions: {},
      deleted: false,
      deletedBy: null,
    });

    // build plain object and enrich with sender meta when available
    const plain: any = doc.toObject ? doc.toObject() : { ...doc };
    const senderMeta = await fetchUserMeta(doc.userId);
    if (senderMeta) {
      plain.sender = { id: String(doc.userId), displayName: senderMeta.displayName, avatarUrl: senderMeta.avatarUrl };
      plain.avatarUrl = senderMeta.avatarUrl || null;
      plain.displayName = senderMeta.displayName || null;
    }

    // emit over websocket to room
    const io = getIO();
    if (io) {
      io.to(chatroomId).emit('message:new', { id: doc._id.toString(), ...plain });
    }

    return { id: doc._id.toString() };
  }

  async list(chatroomId: string) {
    const docs: any[] = await Message.find({ chatroomId }).sort({ createdAt: 1 }).limit(500).lean();

    // collect unique userIds and fetch sender meta in batch (best-effort)
    const userIds = Array.from(new Set(docs.map(d => d.userId).filter(Boolean)));
    let usersMap: Record<string, any> = {};
    try {
      const User = (mongoose.models && (mongoose.models.User as any)) || null;
      if (User && userIds.length) {
        const users = await User.find({ _id: { $in: userIds } }).select('displayName avatarUrl').lean();
        users.forEach((u: any) => { usersMap[String(u._id)] = u; });
      }
    } catch (e) {
      // ignore failures; return messages without sender meta in that case
    }

    return docs.map((d: any) => {
      const id = d._id.toString();
      const out: any = { id, ...d };
      const uid = String(d.userId || '');
      const s = usersMap[uid];
      if (s) {
        out.sender = { id: uid, displayName: s.displayName, avatarUrl: s.avatarUrl };
        out.avatarUrl = s.avatarUrl || null;
        out.displayName = s.displayName || null;
      }
      return out;
    });
  }

  // Toggle (set/unset) a reaction for a user on a message. If the same emoji is passed and already set, it will be removed.
  async react(messageId: string, userId: string, emoji: string | null) {
    const doc: any = await Message.findById(messageId);
    if (!doc) throw new NotFoundException('Message not found');

    const reactions = (doc.reactions && typeof doc.reactions === 'object') ? doc.reactions : {};
    const current = reactions?.get ? reactions.get(userId) : reactions[userId];

    // If emoji is null or same as current - remove reaction
    if (!emoji || current === emoji) {
      if (reactions?.delete) {
        reactions.delete(userId);
      } else {
        delete reactions[userId];
      }
    } else {
      // set/replace reaction
      if (reactions?.set) {
        reactions.set(userId, emoji);
      } else {
        reactions[userId] = emoji;
      }
    }

    doc.reactions = reactions;
    await doc.save();

    // build plain object to return/emit with reactions as plain JS object
    const plain: any = doc.toObject ? doc.toObject() : { ...doc };
    // normalize reactions map -> object
    const reactionsObj: Record<string, string> = {};
    const rawReactions = doc.reactions || {};
    if (rawReactions?.forEach) {
      rawReactions.forEach((v: any, k: any) => { reactionsObj[String(k)] = String(v); });
    } else if (typeof rawReactions === 'object') {
      for (const k of Object.keys(rawReactions)) {
        const v = (rawReactions as any)[k];
        if (typeof v === 'string' || typeof v === 'number') reactionsObj[k] = String(v);
      }
    }
    plain.reactions = reactionsObj;

    // debug log for diagnosis
    console.log('[messages] react saved', { messageId: doc._id.toString(), chatroomId: String(doc.chatroomId), reactions: plain.reactions });

    // enrich with sender meta before emitting
    const senderMetaReact = await fetchUserMeta(doc.userId);
    if (senderMetaReact) {
      plain.sender = { id: String(doc.userId), displayName: senderMetaReact.displayName, avatarUrl: senderMetaReact.avatarUrl };
      plain.avatarUrl = senderMetaReact.avatarUrl || null;
      plain.displayName = senderMetaReact.displayName || null;
    }

    // emit updated message to the room so clients can update their UI
    const io = getIO();
    if (io) {
      console.log('[messages] emitting message:react to room', String(doc.chatroomId), 'messageId', doc._id.toString());
      io.to(String(doc.chatroomId)).emit('message:react', { id: doc._id.toString(), ...plain });
    }

    return { id: doc._id.toString(), ...plain };
  }

  // Mark a message as unsent/deleted by its author so all clients can show a deleted placeholder
  async unsend(messageId: string, userId: string) {
    const doc: any = await Message.findById(messageId);
    if (!doc) throw new NotFoundException('Message not found');

    // Only allow the original sender to unsend in this demo; admins could have other logic
    if (String(doc.userId) !== String(userId)) {
      // in demo, still allow but mark deletedBy as requester
      // alternatively throw ForbiddenException if you want to restrict
    }

    // mark deleted, clear sensitive content
    doc.deleted = true;
    doc.deletedBy = String(userId);
    doc.text = null;
    doc.attachments = [];

    await doc.save();

    const plain: any = doc.toObject ? doc.toObject() : { ...doc };
    // normalize reactions as before
    const reactionsObj: Record<string, string> = {};
    const rawReactions = doc.reactions || {};
    if (rawReactions?.forEach) {
      rawReactions.forEach((v: any, k: any) => { reactionsObj[String(k)] = String(v); });
    } else if (typeof rawReactions === 'object') {
      for (const k of Object.keys(rawReactions)) {
        const v = (rawReactions as any)[k];
        if (typeof v === 'string' || typeof v === 'number') reactionsObj[k] = String(v);
      }
    }
    plain.reactions = reactionsObj;

    // enrich with sender meta before emitting
    const senderMetaUnsend = await fetchUserMeta(doc.userId);
    if (senderMetaUnsend) {
      plain.sender = { id: String(doc.userId), displayName: senderMetaUnsend.displayName, avatarUrl: senderMetaUnsend.avatarUrl };
      plain.avatarUrl = senderMetaUnsend.avatarUrl || null;
      plain.displayName = senderMetaUnsend.displayName || null;
    }

    // emit updated message to the room so clients can update their UI
    const io = getIO();
    if (io) {
      io.to(String(doc.chatroomId)).emit('message:updated', { id: doc._id.toString(), ...plain });
    }

    return { id: doc._id.toString(), ...plain };
  }
}
