"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectMongo = connectMongo;
const mongoose_1 = __importDefault(require("mongoose"));
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chatapp';
async function connectMongo() {
    if (mongoose_1.default.connection.readyState === 1)
        return mongoose_1.default.connection;
    await mongoose_1.default.connect(MONGODB_URI);
    console.log('[mongo] connected to', MONGODB_URI);
    return mongoose_1.default.connection;
}
exports.default = mongoose_1.default;
