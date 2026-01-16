import { Injectable } from '@nestjs/common';
import mongoose from 'mongoose';
import { getIO } from '../../socket';

const ChatroomSchema = new mongoose.Schema({
  name: String,
  ownerId: String,
  members: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
});

const Chatroom = mongoose.models.Chatroom || mongoose.model('Chatroom', ChatroomSchema);

@Injectable()
export class ChatroomService {
  async create(body: any) {
    const ownerId = body.ownerId || null;
    const members = ownerId ? [ownerId] : [];
    const doc = await Chatroom.create({ name: body.name, ownerId, members });
    // add chatroom id to owner joinedChatrooms for persistence
    if (ownerId) {
      const User = mongoose.models.User;
      if (User) await User.findByIdAndUpdate(ownerId, { $addToSet: { joinedChatrooms: doc._id.toString() } }).lean();
    }
    const io = getIO();
    if (io) io.emit('chatroom:created', { id: doc._id.toString(), name: doc.name });
    return { id: doc._id.toString() };
  }

  // if userId is provided, only return chatrooms the user has joined or owns
  async list(userId?: string) {
    if (!userId) return [];
    const docs: any[] = await Chatroom.find({ $or: [{ members: userId }, { ownerId: userId }] }).limit(100).lean();
    return docs.map((d: any) => ({ id: d._id.toString(), name: d.name, members: d.members || [], ownerId: d.ownerId }));
  }

  async get(id: string) {
    const d: any = await Chatroom.findById(id).lean();
    if (!d) return null;
    return { id: d._id.toString(), name: d.name, ownerId: d.ownerId, members: d.members || [], createdAt: d.createdAt };
  }

  async join(chatroomId: string, userId: string) {
    if (!chatroomId || !userId) return { ok: false, error: 'missing-params' };

    // sanitize input: trim and take first token (avoid pasted 'ID Chatroom' text)
    const raw = String(chatroomId || '').trim();
    const idStr = raw.split(/\s+/)[0];

    // validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(idStr)) {
      console.warn('[chatroom] join: invalid id format', chatroomId);
      return { ok: false, error: 'invalid-id' };
    }

    // first verify room exists
    const room: any = await Chatroom.findById(idStr).lean();
    if (!room) {
      console.warn('[chatroom] join: room not found', idStr);
      return { ok: false, error: 'not-found' };
    }

    // ensure string id will be added
    const uidStr = String(userId);
    const d: any = await Chatroom.findByIdAndUpdate(idStr, { $addToSet: { members: uidStr } }, { new: true }).lean();
    // also add to user's joinedChatrooms
    const User = mongoose.models.User;
    if (User) {
      await User.findByIdAndUpdate(userId, { $addToSet: { joinedChatrooms: idStr } }).lean();
    }
    const io = getIO();
    if (io) io.emit('chatroom:member:joined', { chatroomId: idStr, userId: uidStr });
    return { ok: true, id: idStr, name: room.name };
  }

  async leave(chatroomId: string, userId: string) {
    if (!chatroomId || !userId) return { ok: false };
    const uidStr = String(userId);
    const uidObj = (() => { try { return new mongoose.Types.ObjectId(userId); } catch (e) { return null; } })();
    // remove both string and ObjectId representations
    const pullQuery: any = uidObj ? { $in: [uidStr, uidObj] } : uidStr;
    await Chatroom.findByIdAndUpdate(chatroomId, { $pull: { members: pullQuery } }).lean();

    const User = mongoose.models.User;
    if (User) {
      await User.findByIdAndUpdate(userId, { $pull: { joinedChatrooms: chatroomId } }).lean();
    }

    // check remaining members; if none, delete chatroom
    const dAfter: any = await Chatroom.findById(chatroomId).lean();
    const membersArr: string[] = (dAfter && dAfter.members) ? (dAfter.members.map((m: any) => String(m))) : [];
    if (!dAfter || membersArr.length === 0) {
      // remove chatroom entirely
      await Chatroom.findByIdAndDelete(chatroomId).lean();
      // remove reference from all users (just in case)
      if (User) {
        await User.updateMany({ joinedChatrooms: chatroomId }, { $pull: { joinedChatrooms: chatroomId } }).lean();
      }
      const io = getIO();
      if (io) io.emit('chatroom:deleted', { chatroomId });
      return { ok: true, deleted: true };
    }

    // if owner left, transfer ownership to first remaining member
    if (String(dAfter.ownerId) === uidStr) {
      const newOwner = membersArr[0];
      await Chatroom.findByIdAndUpdate(chatroomId, { $set: { ownerId: newOwner } }).lean();
      const io = getIO();
      if (io) io.emit('chatroom:owner:changed', { chatroomId, ownerId: newOwner });
    }

    const io = getIO();
    if (io) io.emit('chatroom:member:left', { chatroomId, userId: uidStr });
    return { ok: true };
  }

  // owner can kick a member
  async kick(chatroomId: string, targetUserId: string, requesterId: string) {
    if (!chatroomId || !targetUserId || !requesterId) return { ok: false };
    const d: any = await Chatroom.findById(chatroomId).lean();
    if (!d) return { ok: false };
    if (String(d.ownerId) !== String(requesterId)) return { ok: false, error: 'not-owner' };
    const tStr = String(targetUserId);
    const tObj = (() => { try { return new mongoose.Types.ObjectId(targetUserId); } catch (e) { return null; } })();
    const pullQ: any = tObj ? { $in: [tStr, tObj] } : tStr;
    // remove target from members
    await Chatroom.findByIdAndUpdate(chatroomId, { $pull: { members: pullQ } }).lean();
    const User = mongoose.models.User;
    if (User) {
      await User.findByIdAndUpdate(targetUserId, { $pull: { joinedChatrooms: chatroomId } }).lean();
    }
    const io = getIO();

    // keep broadcast so others update member list
    if (io) io.emit('chatroom:member:kicked', { chatroomId, userId: tStr });

    // NEW: tell the kicked user directly (requires "user room" in socket.ts)
    if (io) io.to(`user:${tStr}`).emit('chatroom:kicked', { chatroomId, userId: tStr });

    return { ok: true };
  }

  // owner can delete chatroom
  async delete(chatroomId: string, requesterId: string) {
    if (!chatroomId || !requesterId) return { ok: false };
    const d: any = await Chatroom.findById(chatroomId).lean();
    if (!d) return { ok: false };
    if (String(d.ownerId) !== String(requesterId)) return { ok: false, error: 'not-owner' };
    await Chatroom.findByIdAndDelete(chatroomId).lean();
    const User = mongoose.models.User;
    if (User) {
      await User.updateMany({ joinedChatrooms: chatroomId }, { $pull: { joinedChatrooms: chatroomId } }).lean();
    }
    const io = getIO();
    if (io) io.emit('chatroom:deleted', { chatroomId });
    return { ok: true };
  }
}
