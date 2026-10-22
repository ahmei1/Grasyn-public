import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { ListMessagesQueryDto, MessageBodyDto } from './dto/message.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('messages')
@Controller()
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('projects/:projectId/messages')
  list(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.messages.listForProject(user.id, projectId, query);
  }

  @Post('projects/:projectId/messages')
  create(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body() dto: MessageBodyDto,
  ) {
    return this.messages.create(user.id, projectId, dto);
  }

  @Post('projects/:projectId/messages/read')
  markRead(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ) {
    return this.messages.markRead(user.id, projectId);
  }

  @Patch('messages/:messageId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('messageId') messageId: string,
    @Body() dto: MessageBodyDto,
  ) {
    return this.messages.update(user.id, messageId, dto);
  }

  @Delete('messages/:messageId')
  remove(@CurrentUser() user: AuthUser, @Param('messageId') messageId: string) {
    return this.messages.remove(user.id, messageId);
  }
}
