import { Controller, Post, Body, Get, Param, UseGuards, Req, Query, Delete } from '@nestjs/common';
import { ChatroomService } from './chatroom.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';

@Controller('chatrooms')
export class ChatroomController {
  constructor(private readonly svc: ChatroomService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Req() req: Request, @Body() body: any) {
    const user = (req as any).user || {};
    const ownerId = user.uid || null;
    return this.svc.create({ ...body, ownerId });
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Req() req: Request) {
    const user = (req as any).user || {};
    const uid = user.uid;
    return this.svc.list(uid);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/join')
  async join(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user || {};
    const uid = user.uid;
    return this.svc.join(id, uid);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/leave')
  async leave(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user || {};
    const uid = user.uid;
    return this.svc.leave(id, uid);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/kick')
  async kick(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const user = (req as any).user || {};
    const uid = user.uid;
    const targetUserId = body?.targetUserId;
    return this.svc.kick(id, targetUserId, uid);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user || {};
    const uid = user.uid;
    return this.svc.delete(id, uid);
  }
}
