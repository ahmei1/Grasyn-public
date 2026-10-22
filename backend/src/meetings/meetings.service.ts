import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Meeting, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService, isWorkspaceManager } from '../common/access.service';
import { EventsService } from '../common/events.service';
import { TasksService } from '../tasks/tasks.service';
import {
  AddParticipantDto,
  CreateActionItemDto,
  CreateDecisionDto,
  CreateMeetingDto,
  UpdateMeetingDto,
} from './dto/meeting.dto';

const userSelect = { select: { id: true, name: true, email: true } } as const;

const meetingDetail = {
  project: { select: { id: true, name: true, ownerId: true } },
  createdBy: userSelect,
  participants: {
    include: { user: userSelect },
    orderBy: { createdAt: 'asc' },
  },
  decisions: { orderBy: { createdAt: 'asc' } },
  actionItems: {
    include: {
      assignee: userSelect,
      task: { select: { id: true, title: true, status: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.MeetingInclude;

const meetingSummary = {
  createdBy: userSelect,
  participants: { include: { user: userSelect } },
  _count: { select: { decisions: true, actionItems: true } },
} satisfies Prisma.MeetingInclude;

type MeetingWithProject = Meeting & {
  project: { id: string; name: string; ownerId: string } | null;
};

@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly events: EventsService,
    private readonly tasks: TasksService,
  ) {}

  async listForProject(userId: string, projectId: string) {
    const project = await this.access.requireProject(userId, projectId);
    const meetings = await this.prisma.meeting.findMany({
      where: { projectId: project.id },
      include: meetingSummary,
      orderBy: { startsAt: 'desc' },
    });
    return { meetings };
  }

  async get(userId: string, meetingId: string) {
    const meeting = await this.requireMeeting(userId, meetingId);
    return { meeting: await this.detail(meeting.id) };
  }

  async create(userId: string, projectId: string, dto: CreateMeetingDto) {
    const project = await this.access.requireProject(userId, projectId);
    assertTimes(dto.startsAt, dto.endsAt);
    const invited = [...new Set(dto.participantIds ?? [])].filter(
      (id) => id !== userId,
    );
    await this.requireWorkspaceUsers(project.workspaceId, invited);

    const meeting = await this.events.run(() =>
      this.prisma.$transaction(async (tx) => {
        const created = await tx.meeting.create({
          data: {
            workspaceId: project.workspaceId,
            projectId: project.id,
            title: dto.title,
            startsAt: new Date(dto.startsAt),
            endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
            createdById: userId,
            participants: {
              create: [userId, ...invited].map((id) => ({ userId: id })),
            },
          },
          include: { createdBy: userSelect },
        });
        await this.events.activity(
          {
            workspaceId: project.workspaceId,
            actorId: userId,
            projectId: project.id,
            meetingId: created.id,
            type: 'meeting.created',
            metadata: { title: created.title },
          },
          tx,
        );
        for (const participantId of invited) {
          await this.invite(tx, created, participantId, project.name);
        }
        return created;
      }),
    );
    return { meeting: await this.detail(meeting.id) };
  }

  async update(userId: string, meetingId: string, dto: UpdateMeetingDto) {
    const meeting = await this.requireMeeting(userId, meetingId);
    await this.requireEditor(userId, meeting);
    assertTimes(
      dto.startsAt ?? meeting.startsAt.toISOString(),
      dto.endsAt === undefined ? meeting.endsAt?.toISOString() : dto.endsAt,
    );

    const scheduleChanged =
      (dto.title !== undefined && dto.title !== meeting.title) ||
      (dto.startsAt !== undefined &&
        !sameTime(dto.startsAt, meeting.startsAt)) ||
      (dto.endsAt !== undefined && !sameTime(dto.endsAt, meeting.endsAt));

    await this.events.run(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.meeting.update({
          where: { id: meeting.id },
          data: {
            title: dto.title,
            startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
            endsAt:
              dto.endsAt === undefined
                ? undefined
                : dto.endsAt
                  ? new Date(dto.endsAt)
                  : null,
            notes: dto.notes,
          },
        });
        // Note edits happen often; only schedule changes reach the feed.
        if (scheduleChanged) {
          await this.events.activity(
            {
              workspaceId: meeting.workspaceId,
              actorId: userId,
              projectId: meeting.projectId ?? undefined,
              meetingId: meeting.id,
              type: 'meeting.updated',
              metadata: { title: dto.title ?? meeting.title },
            },
            tx,
          );
        } else {
          this.changed(meeting);
        }
      }),
    );
    return { meeting: await this.detail(meeting.id) };
  }

  async remove(userId: string, meetingId: string) {
    const meeting = await this.requireMeeting(userId, meetingId);
    await this.requireOrganizer(userId, meeting);
    await this.events.run(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.meeting.delete({ where: { id: meeting.id } });
        await this.events.activity(
          {
            workspaceId: meeting.workspaceId,
            actorId: userId,
            projectId: meeting.projectId ?? undefined,
            type: 'meeting.deleted',
            metadata: { title: meeting.title },
          },
          tx,
        );
      }),
    );
    return { ok: true };
  }

  async addParticipant(
    userId: string,
    meetingId: string,
    dto: AddParticipantDto,
  ) {
    const meeting = await this.requireMeeting(userId, meetingId);
    await this.requireEditor(userId, meeting);
    await this.requireWorkspaceUsers(meeting.workspaceId, [dto.userId]);
    await this.events.run(() =>
      this.prisma.$transaction(async (tx) => {
        const existing = await tx.meetingParticipant.findUnique({
          where: {
            meetingId_userId: { meetingId: meeting.id, userId: dto.userId },
          },
        });
        if (existing) return;
        await tx.meetingParticipant.create({
          data: { meetingId: meeting.id, userId: dto.userId },
        });
        if (dto.userId !== userId) {
          await this.invite(tx, meeting, dto.userId, meeting.project?.name);
        }
        this.changed(meeting);
      }),
    );
    return { meeting: await this.detail(meeting.id) };
  }

  async removeParticipant(
    userId: string,
    meetingId: string,
    participantId: string,
  ) {
    const meeting = await this.requireMeeting(userId, meetingId);
    await this.requireEditor(userId, meeting);
    await this.prisma.meetingParticipant.deleteMany({
      where: { meetingId: meeting.id, userId: participantId },
    });
    this.changed(meeting);
    return { meeting: await this.detail(meeting.id) };
  }

  async addDecision(userId: string, meetingId: string, dto: CreateDecisionDto) {
    const meeting = await this.requireMeeting(userId, meetingId);
    await this.requireEditor(userId, meeting);
    await this.prisma.meetingDecision.create({
      data: { meetingId: meeting.id, body: dto.body },
    });
    this.changed(meeting);
    return { meeting: await this.detail(meeting.id) };
  }

  async removeDecision(userId: string, meetingId: string, decisionId: string) {
    const meeting = await this.requireMeeting(userId, meetingId);
    await this.requireEditor(userId, meeting);
    await this.prisma.meetingDecision.deleteMany({
      where: { id: decisionId, meetingId: meeting.id },
    });
    this.changed(meeting);
    return { meeting: await this.detail(meeting.id) };
  }

  async addActionItem(
    userId: string,
    meetingId: string,
    dto: CreateActionItemDto,
  ) {
    const meeting = await this.requireMeeting(userId, meetingId);
    await this.requireEditor(userId, meeting);
    if (dto.assigneeId) {
      await this.requireWorkspaceUsers(meeting.workspaceId, [dto.assigneeId]);
    }
    await this.prisma.meetingActionItem.create({
      data: {
        meetingId: meeting.id,
        title: dto.title,
        assigneeId: dto.assigneeId ?? null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      },
    });
    this.changed(meeting);
    return { meeting: await this.detail(meeting.id) };
  }

  async removeActionItem(userId: string, meetingId: string, itemId: string) {
    const meeting = await this.requireMeeting(userId, meetingId);
    await this.requireEditor(userId, meeting);
    const item = await this.requireActionItem(meeting.id, itemId);
    if (item.taskId) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'This action item is already a task',
      });
    }
    await this.prisma.meetingActionItem.delete({ where: { id: item.id } });
    this.changed(meeting);
    return { meeting: await this.detail(meeting.id) };
  }

  /**
   * Goes through the normal task creation path, so a member still cannot set
   * an assignee or due date they would not be allowed to set by hand.
   */
  async convertActionItem(userId: string, meetingId: string, itemId: string) {
    const meeting = await this.requireMeeting(userId, meetingId);
    await this.requireEditor(userId, meeting);
    if (!meeting.projectId) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'Only project meetings can create tasks',
      });
    }
    const item = await this.requireActionItem(meeting.id, itemId);
    if (item.taskId) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'This action item is already a task',
      });
    }

    const { task } = await this.tasks.create(
      userId,
      meeting.projectId,
      {
        title: item.title,
        description: `From the meeting "${meeting.title}".`,
        assigneeId: item.assigneeId ?? undefined,
        dueDate: item.dueDate?.toISOString() ?? undefined,
      },
      async (tx, created) => {
        const claimed = await tx.meetingActionItem.updateMany({
          where: { id: item.id, taskId: null },
          data: { taskId: created.id },
        });
        if (claimed.count === 0) {
          throw new ConflictException({
            code: 'CONFLICT',
            message: 'This action item is already a task',
          });
        }
        await this.events.activity(
          {
            workspaceId: meeting.workspaceId,
            actorId: userId,
            projectId: meeting.projectId ?? undefined,
            taskId: created.id,
            meetingId: meeting.id,
            type: 'meeting.action_converted',
            metadata: { title: item.title, meetingTitle: meeting.title },
          },
          tx,
        );
      },
    );
    return { task, meeting: await this.detail(meeting.id) };
  }

  private detail(meetingId: string) {
    return this.prisma.meeting.findUniqueOrThrow({
      where: { id: meetingId },
      include: meetingDetail,
    });
  }

  private async requireMeeting(
    userId: string,
    meetingId: string,
  ): Promise<MeetingWithProject> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { project: { select: { id: true, name: true, ownerId: true } } },
    });
    if (!meeting) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Meeting not found',
      });
    }
    await this.access.requireMembership(userId, meeting.workspaceId);
    return meeting;
  }

  private async requireActionItem(meetingId: string, itemId: string) {
    const item = await this.prisma.meetingActionItem.findFirst({
      where: { id: itemId, meetingId },
    });
    if (!item) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Action item not found',
      });
    }
    return item;
  }

  /** Organizer, project owner, or workspace admin. */
  private async isOrganizer(userId: string, meeting: MeetingWithProject) {
    if (meeting.createdById === userId) return true;
    if (meeting.project?.ownerId === userId) return true;
    const membership = await this.access.requireMembership(
      userId,
      meeting.workspaceId,
    );
    return isWorkspaceManager(membership.role);
  }

  private async requireOrganizer(userId: string, meeting: MeetingWithProject) {
    if (await this.isOrganizer(userId, meeting)) return;
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message:
        'Only the organizer, the project creator, or a workspace admin can do this',
    });
  }

  /** Anyone who can organize the meeting, plus everyone invited to it. */
  private async requireEditor(userId: string, meeting: MeetingWithProject) {
    if (await this.isOrganizer(userId, meeting)) return;
    const seat = await this.prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId: meeting.id, userId } },
    });
    if (seat) return;
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Only meeting participants can edit this meeting',
    });
  }

  private async requireWorkspaceUsers(workspaceId: string, userIds: string[]) {
    if (userIds.length === 0) return;
    const count = await this.prisma.workspaceMember.count({
      where: { workspaceId, userId: { in: userIds } },
    });
    if (count !== userIds.length) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'Every participant must be a member of this workspace',
      });
    }
  }

  private async invite(
    tx: Prisma.TransactionClient,
    meeting: Meeting,
    participantId: string,
    projectName?: string,
  ) {
    await this.events.notify(
      {
        workspaceId: meeting.workspaceId,
        userId: participantId,
        type: 'meeting.invited',
        title: 'Added to a meeting',
        body: projectName
          ? `You were added to "${meeting.title}" in ${projectName}.`
          : `You were added to "${meeting.title}".`,
        resourceType: 'meeting',
        resourceId: meeting.id,
      },
      tx,
    );
  }

  /** Refreshes open screens without adding a line to the activity feed. */
  private changed(meeting: Meeting) {
    this.events.publish({
      room: `workspace:${meeting.workspaceId}`,
      event: 'activity',
      data: {
        type: 'meeting.changed',
        workspaceId: meeting.workspaceId,
        projectId: meeting.projectId,
        meetingId: meeting.id,
      },
    });
  }
}

function sameTime(next: string | null, current: Date | null) {
  if (!next || !current) return !next && !current;
  return new Date(next).getTime() === current.getTime();
}

function assertTimes(startsAt: string, endsAt?: string | null) {
  if (endsAt && new Date(endsAt) < new Date(startsAt)) {
    throw new BadRequestException({
      code: 'BAD_REQUEST',
      message: 'A meeting cannot end before it starts',
    });
  }
}
