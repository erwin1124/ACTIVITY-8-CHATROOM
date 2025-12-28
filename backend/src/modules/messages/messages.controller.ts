import { Controller, Post, Body, Get, Param, UseGuards, Req } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';

@Controller('messages')
export class MessagesController {
  constructor(private readonly svc: MessagesService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async send(@Req() req: Request, @Body() body: any) {
    const user = (req as any).user || {};
    body.userId = user.uid;
    body.userName = user.displayName || user.email || 'Unknown';
    return this.svc.send(body.chatroomId, body);
  }

  @Get('chatroom/:chatroomId')
  async list(@Param('chatroomId') chatroomId: string) {
    return this.svc.list(chatroomId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/react')
  async react(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const user = (req as any).user || {};
    const emoji = body?.emoji ?? null;
    return this.svc.react(id, user.uid, emoji);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/unsend')
  async unsend(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user || {};
    return this.svc.unsend(id, user.uid);
  }
}
