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
exports.MessagesService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = __importDefault(require("mongoose"));
const socket_1 = require("../../socket");
const MessageSchema = new mongoose_1.default.Schema({
    chatroomId: String,
    text: String,
    userId: String,
    userName: String,
    attachments: Array,
    createdAt: { type: Date, default: Date.now },
});
const Message = mongoose_1.default.models.Message || mongoose_1.default.model('Message', MessageSchema);
let MessagesService = class MessagesService {
    async send(chatroomId, body) {
        const doc = await Message.create({
            chatroomId,
            text: body.text || null,
            userId: body.userId || null,
            userName: body.userName || null,
            attachments: body.attachments || null,
        });
        // emit over websocket to room
        const io = (0, socket_1.getIO)();
        if (io) {
            io.to(chatroomId).emit('message:new', { id: doc._id.toString(), ...doc.toObject() });
        }
        return { id: doc._id.toString() };
    }
    async list(chatroomId) {
        const docs = await Message.find({ chatroomId }).sort({ createdAt: 1 }).limit(500).lean();
        return docs.map((d) => ({ id: d._id.toString(), ...d }));
    }
};
exports.MessagesService = MessagesService;
exports.MessagesService = MessagesService = __decorate([
    (0, common_1.Injectable)()
], MessagesService);
