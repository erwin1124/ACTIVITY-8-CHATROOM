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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = __importDefault(require("mongoose"));
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
// NOTE: reverted to default Mongo _id behavior. Removed Counter/sequence logic to restore randomized ObjectId ids.
// User schema
const UserSchema = new mongoose_1.default.Schema({
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    displayName: String,
    username: String,
    avatarUrl: String,
    joinedChatrooms: [{ type: String }],
    createdAt: { type: Date, default: Date.now },
});
const User = mongoose_1.default.models.User || mongoose_1.default.model('User', UserSchema);
let AuthService = class AuthService {
    async signup(body) {
        const { email, password, displayName, username } = body;
        if (!email || !password)
            throw new common_1.BadRequestException('email and password required');
        const existing = await User.findOne({ email }).lean();
        if (existing)
            throw new common_1.BadRequestException('Email already in use');
        try {
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);
            // create user (Mongo will generate _id)
            const user = await User.create({ email, passwordHash, displayName, username });
            console.log('User.create result:', user);
            const token = this.generateToken(user);
            return {
                user: { id: user._id.toString(), email: user.email, displayName: user.displayName, username: user.username },
                token,
            };
        }
        catch (err) {
            console.error('signup error:', err);
            // Handle Mongo duplicate key error more gracefully and return field-specific message
            if (err && (err.code === 11000 || err.name === 'MongoServerError')) {
                const keyValue = err.keyValue || {};
                const fields = Object.keys(keyValue);
                if (fields.length) {
                    const msgs = fields.map(f => `${f} already exists`).join('; ');
                    throw new common_1.BadRequestException(msgs);
                }
                // fallback generic duplicate message
                throw new common_1.BadRequestException('Duplicate key error');
            }
            throw new common_1.InternalServerErrorException('Failed to create user');
        }
    }
    async login(body) {
        const { email, password } = body;
        if (!email || !password)
            throw new common_1.BadRequestException('email and password required');
        // find the user (not using lean so we keep mongoose document for safety)
        const user = await User.findOne({ email });
        if (!user)
            throw new common_1.BadRequestException('Invalid email or password');
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid)
            throw new common_1.BadRequestException('Invalid email or password');
        const token = this.generateToken(user);
        return {
            user: { id: user._id.toString(), email: user.email, displayName: user.displayName, username: user.username, avatarUrl: user.avatarUrl },
            token,
        };
    }
    // return user by mongo id (without passwordHash)
    async getById(id) {
        if (!id)
            return null;
        const u = await User.findById(id).select('-passwordHash').lean();
        if (!u)
            return null;
        return { id: u._id.toString(), email: u.email, displayName: u.displayName, username: u.username, avatarUrl: u.avatarUrl, joinedChatrooms: u.joinedChatrooms || [] };
    }
    // list users (exclude password)
    async listUsers() {
        const docs = await User.find().select('-passwordHash').limit(100).lean();
        return docs.map(d => ({ id: d._id.toString(), email: d.email, displayName: d.displayName, username: d.username, avatarUrl: d.avatarUrl, joinedChatrooms: d.joinedChatrooms || [] }));
    }
    async updateMe(id, body) {
        if (!id)
            throw new common_1.BadRequestException('missing id');
        const update = {};
        if (body.displayName !== undefined)
            update.displayName = body.displayName;
        if (body.username !== undefined)
            update.username = body.username;
        if (body.avatarUrl !== undefined)
            update.avatarUrl = body.avatarUrl;
        if (body.joinedChatrooms !== undefined)
            update.joinedChatrooms = body.joinedChatrooms;
        const u = await User.findByIdAndUpdate(id, { $set: update }, { new: true }).select('-passwordHash').lean();
        if (!u)
            throw new common_1.BadRequestException('User not found');
        return { id: u._id.toString(), email: u.email, displayName: u.displayName, username: u.username, avatarUrl: u.avatarUrl, joinedChatrooms: u.joinedChatrooms || [] };
    }
    generateToken(user) {
        const uid = user._id ? user._id.toString() : (user.id || user.uid);
        const payload = { uid, email: user.email, displayName: user.displayName, username: user.username };
        const secret = process.env.JWT_SECRET || 'dev-secret';
        const expiresIn = process.env.JWT_EXPIRES || '7d';
        return jwt.sign(payload, secret, { expiresIn });
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)()
], AuthService);
