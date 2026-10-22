import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MeetingsService } from './meetings.service';
import {
  AddParticipantDto,
  CreateActionItemDto,
  CreateDecisionDto,
  CreateMeetingDto,
  UpdateMeetingDto,
} from './dto/meeting.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('meetings')
@Controller()
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get('projects/:projectId/meetings')
  list(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string) {
    return this.meetings.listForProject(user.id, projectId);
  }

  @Post('projects/:projectId/meetings')
  create(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateMeetingDto,
  ) {
    return this.meetings.create(user.id, projectId, dto);
  }

  @Get('meetings/:meetingId')
  get(@CurrentUser() user: AuthUser, @Param('meetingId') meetingId: string) {
    return this.meetings.get(user.id, meetingId);
  }

  @Patch('meetings/:meetingId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('meetingId') meetingId: string,
    @Body() dto: UpdateMeetingDto,
  ) {
    return this.meetings.update(user.id, meetingId, dto);
  }

  @Delete('meetings/:meetingId')
  remove(@CurrentUser() user: AuthUser, @Param('meetingId') meetingId: string) {
    return this.meetings.remove(user.id, meetingId);
  }

  @Post('meetings/:meetingId/participants')
  addParticipant(
    @CurrentUser() user: AuthUser,
    @Param('meetingId') meetingId: string,
    @Body() dto: AddParticipantDto,
  ) {
    return this.meetings.addParticipant(user.id, meetingId, dto);
  }

  @Delete('meetings/:meetingId/participants/:userId')
  removeParticipant(
    @CurrentUser() user: AuthUser,
    @Param('meetingId') meetingId: string,
    @Param('userId') participantId: string,
  ) {
    return this.meetings.removeParticipant(user.id, meetingId, participantId);
  }

  @Post('meetings/:meetingId/decisions')
  addDecision(
    @CurrentUser() user: AuthUser,
    @Param('meetingId') meetingId: string,
    @Body() dto: CreateDecisionDto,
  ) {
    return this.meetings.addDecision(user.id, meetingId, dto);
  }

  @Delete('meetings/:meetingId/decisions/:decisionId')
  removeDecision(
    @CurrentUser() user: AuthUser,
    @Param('meetingId') meetingId: string,
    @Param('decisionId') decisionId: string,
  ) {
    return this.meetings.removeDecision(user.id, meetingId, decisionId);
  }

  @Post('meetings/:meetingId/action-items')
  addActionItem(
    @CurrentUser() user: AuthUser,
    @Param('meetingId') meetingId: string,
    @Body() dto: CreateActionItemDto,
  ) {
    return this.meetings.addActionItem(user.id, meetingId, dto);
  }

  @Delete('meetings/:meetingId/action-items/:itemId')
  removeActionItem(
    @CurrentUser() user: AuthUser,
    @Param('meetingId') meetingId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.meetings.removeActionItem(user.id, meetingId, itemId);
  }

  @Post('meetings/:meetingId/action-items/:itemId/task')
  convertActionItem(
    @CurrentUser() user: AuthUser,
    @Param('meetingId') meetingId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.meetings.convertActionItem(user.id, meetingId, itemId);
  }
}
