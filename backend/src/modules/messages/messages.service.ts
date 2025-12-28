import { Injectable, NotFoundException } from '@nestjs/common';
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

@Injectable()
export class MessagesService {
  async send(chatroomId: string, body: any) {
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

    // emit over websocket to room
    const io = getIO();
    if (io) {
      io.to(chatroomId).emit('message:new', { id: doc._id.toString(), ...doc.toObject() });
    }

    return { id: doc._id.toString() };
  }

  async list(chatroomId: string) {
    const docs: any[] = await Message.find({ chatroomId }).sort({ createdAt: 1 }).limit(500).lean();
    return docs.map((d: any) => ({ id: d._id.toString(), ...d }));
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

    // emit updated message to the room so clients can update their UI
    const io = getIO();
    if (io) {
      io.to(String(doc.chatroomId)).emit('message:updated', { id: doc._id.toString(), ...plain });
    }

    return { id: doc._id.toString(), ...plain };
  }
}
