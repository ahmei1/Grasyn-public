import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService, isWorkspaceManager } from '../common/access.service';
import { EventsService } from '../common/events.service';
import { workspaceManagerIds } from '../common/workspace-managers';
import { ListMessagesQueryDto, MessageBodyDto } from './dto/message.dto';

const messageInclude = {
  author: { select: { id: true, name: true, email: true } },
} as const;

const MESSAGE_NOTIFICATION = 'project.message';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly events: EventsService,
  ) {}

  /** Newest page first in the query, returned oldest-first for display. */
  async listForProject(
    userId: string,
    projectId: string,
    query: ListMessagesQueryDto,
  ) {
    const project = await this.access.requireProject(userId, projectId);
    const limit = query.limit ?? 50;
    const rows = await this.prisma.message.findMany({
      where: { projectId: project.id },
      include: messageInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.before ? { cursor: { id: query.before }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit).reverse();
    return { messages, hasMore };
  }

  async create(userId: string, projectId: string, dto: MessageBodyDto) {
    const project = await this.access.requireProject(userId, projectId);
    const message = await this.events.run(() =>
      this.prisma.$transaction(async (tx) => {
        const created = await tx.message.create({
          data: {
            workspaceId: project.workspaceId,
            projectId: project.id,
            authorId: userId,
            body: dto.body,
          },
          include: messageInclude,
        });
        await this.notifyFollowers(tx, project, created);
        return created;
      }),
    );
    this.announce(project.workspaceId, project.id, 'message.created');
    return { message };
  }

  /** Called while the discussion is on screen, so live readers aren't nagged. */
  async markRead(userId: string, projectId: string) {
    const project = await this.access.requireProject(userId, projectId);
    const { count } = await this.prisma.notification.updateMany({
      where: {
        userId,
        workspaceId: project.workspaceId,
        type: MESSAGE_NOTIFICATION,
        resourceId: project.id,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    if (count > 0) {
      this.events.publish({
        room: `user:${userId}`,
        event: 'notification',
        data: { workspaceId: project.workspaceId },
      });
    }
    return { ok: true };
  }

  /**
   * Followers are the project owner, its members, workspace admins, anyone
   * with a task in the project, and anyone who has posted here. One unread
   * notification per project is kept and refreshed, so a busy thread doesn't
   * bury everything else.
   */
  private async notifyFollowers(
    tx: Prisma.TransactionClient,
    project: { id: string; workspaceId: string; ownerId: string; name: string },
    message: { authorId: string; body: string; author: { name: string } },
  ) {
    const [members, managers, posters, assignees] = await Promise.all([
      tx.projectMember.findMany({
        where: { projectId: project.id },
        select: { userId: true },
      }),
      workspaceManagerIds(tx, project.workspaceId),
      tx.message.findMany({
        where: { projectId: project.id },
        distinct: ['authorId'],
        select: { authorId: true },
      }),
      tx.task.findMany({
        where: { projectId: project.id, assigneeId: { not: null } },
        distinct: ['assigneeId'],
        select: { assigneeId: true },
      }),
    ]);
    const recipients = new Set<string>([
      project.ownerId,
      ...members.map((m) => m.userId),
      ...managers,
      ...posters.map((p) => p.authorId),
      ...assignees.flatMap((t) => (t.assigneeId ? [t.assigneeId] : [])),
    ]);
    recipients.delete(message.authorId);
    const current = await tx.workspaceMember.findMany({
      where: {
        workspaceId: project.workspaceId,
        userId: { in: [...recipients] },
      },
      select: { userId: true },
    });
    const stillMembers = new Set(current.map((m) => m.userId));

    const excerpt =
      message.body.length > 140
        ? `${message.body.slice(0, 137).trimEnd()}...`
        : message.body;
    const body = `${message.author.name}: ${excerpt}`;

    for (const recipientId of recipients) {
      if (!stillMembers.has(recipientId)) continue;
      const unread = await tx.notification.findFirst({
        where: {
          userId: recipientId,
          workspaceId: project.workspaceId,
          type: MESSAGE_NOTIFICATION,
          resourceId: project.id,
          readAt: null,
        },
        select: { id: true },
      });
      if (unread) {
        await tx.notification.update({
          where: { id: unread.id },
          data: {
            title: `New messages in ${project.name}`,
            body,
            createdAt: new Date(),
          },
        });
        this.events.publish({
          room: `user:${recipientId}`,
          event: 'notification',
          data: { workspaceId: project.workspaceId },
        });
        continue;
      }
      await this.events.notify(
        {
          workspaceId: project.workspaceId,
          userId: recipientId,
          type: MESSAGE_NOTIFICATION,
          title: `New message in ${project.name}`,
          body,
          resourceType: 'project',
          resourceId: project.id,
        },
        tx,
      );
    }
  }

  async update(userId: string, messageId: string, dto: MessageBodyDto) {
    const existing = await this.requireMessage(userId, messageId);
    if (existing.authorId !== userId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You can only edit your own messages',
      });
    }
    const message = await this.prisma.message.update({
      where: { id: existing.id },
      data: { body: dto.body, editedAt: new Date() },
      include: messageInclude,
    });
    this.announce(existing.workspaceId, existing.projectId, 'message.updated');
    return { message };
  }

  async remove(userId: string, messageId: string) {
    const existing = await this.requireMessage(userId, messageId);
    if (existing.authorId !== userId) {
      const membership = await this.access.requireMembership(
        userId,
        existing.workspaceId,
      );
      if (!isWorkspaceManager(membership.role)) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Only the author or a workspace admin can delete this',
        });
      }
    }
    await this.prisma.message.delete({ where: { id: existing.id } });
    this.announce(existing.workspaceId, existing.projectId, 'message.deleted');
    return { ok: true };
  }

  private async requireMessage(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Message not found',
      });
    }
    await this.access.requireMembership(userId, message.workspaceId);
    return message;
  }

  /**
   * Chat is too chatty for the activity feed, so it only goes to people who
   * have the project open.
   */
  private announce(
    workspaceId: string,
    projectId: string | null,
    type: string,
  ) {
    if (!projectId) return;
    this.events.publish({
      room: `project:${projectId}`,
      event: 'message',
      data: { type, workspaceId, projectId },
    });
  }
}
