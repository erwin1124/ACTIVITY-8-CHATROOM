import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import mongoose from 'mongoose';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// User schema
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  displayName: String,
  username: String,
  avatarUrl: String,
  joinedChatrooms: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

@Injectable()
export class AuthService {
  async signup(body: any) {
    const { email, password, displayName, username } = body;
    if (!email || !password) throw new BadRequestException('email and password required');
    const existing = await User.findOne({ email }).lean();
    if (existing) throw new BadRequestException('Email already in use');

    try {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      
      const user = await User.create({ email, passwordHash, displayName, username });
      console.log('User.create result:', user);

      const token = this.generateToken(user);

      return {
        user: { id: user._id.toString(), email: user.email, displayName: user.displayName, username: user.username },
        token,
      };
    } catch (err: any) {
      console.error('signup error:', err);
      
      if (err && (err.code === 11000 || err.name === 'MongoServerError')) {
        const keyValue = err.keyValue || {};
        const fields = Object.keys(keyValue);
        if (fields.length) {
          const msgs = fields.map(f => `${f} already exists`).join('; ');
          throw new BadRequestException(msgs);
        }
        
        throw new BadRequestException('Duplicate key error');
      }
      throw new InternalServerErrorException('Failed to create user');
    }
  }

  async login(body: any) {
    const { email, password } = body;
    if (!email || !password) throw new BadRequestException('email and password required');

    
    const user: any = await User.findOne({ email });
    if (!user) throw new BadRequestException('Invalid email or password');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new BadRequestException('Invalid email or password');

    const token = this.generateToken(user);

    return {
      user: { id: user._id.toString(), email: user.email, displayName: user.displayName, username: user.username, avatarUrl: user.avatarUrl },
      token,
    };
  }


  async getById(id: string) {
    if (!id) return null;
    const u: any = await User.findById(id).select('-passwordHash').lean();
    if (!u) return null;
    return { id: u._id.toString(), email: u.email, displayName: u.displayName, username: u.username, avatarUrl: u.avatarUrl, joinedChatrooms: u.joinedChatrooms || [] };
  }


  async listUsers() {
    const docs: any[] = await User.find().select('-passwordHash').limit(100).lean();
    return docs.map(d => ({ id: d._id.toString(), email: d.email, displayName: d.displayName, username: d.username, avatarUrl: d.avatarUrl, joinedChatrooms: d.joinedChatrooms || [] }));
  }

  async updateMe(id: string, body: any) {
    if (!id) throw new BadRequestException('missing id');
    const update: any = {};
    if (body.displayName !== undefined) update.displayName = body.displayName;
    if (body.username !== undefined) update.username = body.username;
    if (body.avatarUrl !== undefined) update.avatarUrl = body.avatarUrl;
    if (body.joinedChatrooms !== undefined) update.joinedChatrooms = body.joinedChatrooms;
    const u: any = await User.findByIdAndUpdate(id, { $set: update }, { new: true }).select('-passwordHash').lean();
    if (!u) throw new BadRequestException('User not found');
    return { id: u._id.toString(), email: u.email, displayName: u.displayName, username: u.username, avatarUrl: u.avatarUrl, joinedChatrooms: u.joinedChatrooms || [] };
  }

  generateToken(user: any) {
    const uid = user._id ? user._id.toString() : (user.id || user.uid);
    const payload: any = { uid, email: user.email, displayName: user.displayName, username: user.username };
    const secret = process.env.JWT_SECRET || 'dev-secret';
    const expiresIn = process.env.JWT_EXPIRES || '7d';
    return jwt.sign(payload, secret, { expiresIn });
  }
}
