import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { ChatroomModule } from './modules/chatroom/chatroom.module';
import { MessagesModule } from './modules/messages/messages.module';
import { FilesModule } from './modules/files/files.module';

@Module({
  imports: [AuthModule, ChatroomModule, MessagesModule, FilesModule],
})
export class AppModule {}
