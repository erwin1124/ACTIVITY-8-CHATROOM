"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatroomService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = __importDefault(require("mongoose"));
const socket_1 = require("../../socket");
const ChatroomSchema = new mongoose_1.default.Schema({
    name: String,
    ownerId: String,
    members: [{ type: String }],
    createdAt: { type: Date, default: Date.now },
});
const Chatroom = mongoose_1.default.models.Chatroom || mongoose_1.default.model('Chatroom', ChatroomSchema);
let ChatroomService = class ChatroomService {
    async create(body) {
        const ownerId = body.ownerId || null;
        const members = ownerId ? [ownerId] : [];
        const doc = await Chatroom.create({ name: body.name, ownerId, members });
        // add chatroom id to owner's joinedChatrooms for persistence
        if (ownerId) {
            const User = mongoose_1.default.models.User;
            if (User)
                await User.findByIdAndUpdate(ownerId, { $addToSet: { joinedChatrooms: doc._id.toString() } }).lean();
        }
        const io = (0, socket_1.getIO)();
        if (io)
            io.emit('chatroom:created', { id: doc._id.toString(), name: doc.name });
        return { id: doc._id.toString() };
    }
    // if userId is provided, only return chatrooms the user has joined or owns
    async list(userId) {
        if (!userId)
            return [];
        const docs = await Chatroom.find({ $or: [{ members: userId }, { ownerId: userId }] }).limit(100).lean();
        return docs.map((d) => ({ id: d._id.toString(), name: d.name, members: d.members || [], ownerId: d.ownerId }));
    }
    async get(id) {
        const d = await Chatroom.findById(id).lean();
        if (!d)
            return null;
        return { id: d._id.toString(), name: d.name, ownerId: d.ownerId, members: d.members || [], createdAt: d.createdAt };
    }
    async join(chatroomId, userId) {
        if (!chatroomId || !userId)
            return { ok: false, error: 'missing-params' };
        // sanitize input: trim and take first token (avoid pasted 'ID Chatroom' text)
        const raw = String(chatroomId || '').trim();
        const idStr = raw.split(/\s+/)[0];
        // validate ObjectId format
        if (!mongoose_1.default.Types.ObjectId.isValid(idStr)) {
            console.warn('[chatroom] join: invalid id format', chatroomId);
            return { ok: false, error: 'invalid-id' };
        }
        // first verify room exists
        const room = await Chatroom.findById(idStr).lean();
        if (!room) {
            console.warn('[chatroom] join: room not found', idStr);
            return { ok: false, error: 'not-found' };
        }
        // ensure we add string id
        const uidStr = String(userId);
        const d = await Chatroom.findByIdAndUpdate(idStr, { $addToSet: { members: uidStr } }, { new: true }).lean();
        // also add to user's joinedChatrooms
        const User = mongoose_1.default.models.User;
        if (User) {
            await User.findByIdAndUpdate(userId, { $addToSet: { joinedChatrooms: idStr } }).lean();
        }
        const io = (0, socket_1.getIO)();
        if (io)
            io.emit('chatroom:member:joined', { chatroomId: idStr, userId: uidStr });
        return { ok: true, id: idStr, name: room.name };
    }
    async leave(chatroomId, userId) {
        if (!chatroomId || !userId)
            return { ok: false };
        const uidStr = String(userId);
        const uidObj = (() => { try {
            return new mongoose_1.default.Types.ObjectId(userId);
        }
        catch (e) {
            return null;
        } })();
        // remove both string and ObjectId representations
        const pullQuery = uidObj ? { $in: [uidStr, uidObj] } : uidStr;
        await Chatroom.findByIdAndUpdate(chatroomId, { $pull: { members: pullQuery } }).lean();
        const User = mongoose_1.default.models.User;
        if (User) {
            await User.findByIdAndUpdate(userId, { $pull: { joinedChatrooms: chatroomId } }).lean();
        }
        // check remaining members; if none, delete chatroom
        const dAfter = await Chatroom.findById(chatroomId).lean();
        const membersArr = (dAfter && dAfter.members) ? (dAfter.members.map((m) => String(m))) : [];
        if (!dAfter || membersArr.length === 0) {
            // remove chatroom entirely
            await Chatroom.findByIdAndDelete(chatroomId).lean();
            // remove reference from all users (just in case)
            if (User) {
                await User.updateMany({ joinedChatrooms: chatroomId }, { $pull: { joinedChatrooms: chatroomId } }).lean();
            }
            const io = (0, socket_1.getIO)();
            if (io)
                io.emit('chatroom:deleted', { chatroomId });
            return { ok: true, deleted: true };
        }
        // if owner left, transfer ownership to first remaining member
        if (String(dAfter.ownerId) === uidStr) {
            const newOwner = membersArr[0];
            await Chatroom.findByIdAndUpdate(chatroomId, { $set: { ownerId: newOwner } }).lean();
            const io = (0, socket_1.getIO)();
            if (io)
                io.emit('chatroom:owner:changed', { chatroomId, ownerId: newOwner });
        }
        const io = (0, socket_1.getIO)();
        if (io)
            io.emit('chatroom:member:left', { chatroomId, userId: uidStr });
        return { ok: true };
    }
    // owner can kick a member
    async kick(chatroomId, targetUserId, requesterId) {
        if (!chatroomId || !targetUserId || !requesterId)
            return { ok: false };
        const d = await Chatroom.findById(chatroomId).lean();
        if (!d)
            return { ok: false };
        if (String(d.ownerId) !== String(requesterId))
            return { ok: false, error: 'not-owner' };
        const tStr = String(targetUserId);
        const tObj = (() => { try {
            return new mongoose_1.default.Types.ObjectId(targetUserId);
        }
        catch (e) {
            return null;
        } })();
        const pullQ = tObj ? { $in: [tStr, tObj] } : tStr;
        // remove target from members
        await Chatroom.findByIdAndUpdate(chatroomId, { $pull: { members: pullQ } }).lean();
        const User = mongoose_1.default.models.User;
        if (User) {
            await User.findByIdAndUpdate(targetUserId, { $pull: { joinedChatrooms: chatroomId } }).lean();
        }
        const io = (0, socket_1.getIO)();
        if (io)
            io.emit('chatroom:member:kicked', { chatroomId, userId: tStr });
        return { ok: true };
    }
    // owner can delete chatroom
    async delete(chatroomId, requesterId) {
        if (!chatroomId || !requesterId)
            return { ok: false };
        const d = await Chatroom.findById(chatroomId).lean();
        if (!d)
            return { ok: false };
        if (String(d.ownerId) !== String(requesterId))
            return { ok: false, error: 'not-owner' };
        await Chatroom.findByIdAndDelete(chatroomId).lean();
        const User = mongoose_1.default.models.User;
        if (User) {
            await User.updateMany({ joinedChatrooms: chatroomId }, { $pull: { joinedChatrooms: chatroomId } }).lean();
        }
        const io = (0, socket_1.getIO)();
        if (io)
            io.emit('chatroom:deleted', { chatroomId });
        return { ok: true };
    }
};
exports.ChatroomService = ChatroomService;
exports.ChatroomService = ChatroomService = __decorate([
    (0, common_1.Injectable)()
], ChatroomService);
