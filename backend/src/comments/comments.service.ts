import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { EventsService } from '../common/events.service';
import { workspaceManagerIds } from '../common/workspace-managers';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly events: EventsService,
  ) {}

  async list(userId: string, taskId: string) {
    const task = await this.access.requireTask(userId, taskId);
    const comments = await this.prisma.comment.findMany({
      where: { taskId: task.id },
      include: {
        author: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return { comments };
  }

  async create(userId: string, taskId: string, dto: CreateCommentDto) {
    const task = await this.access.requireTask(userId, taskId);
    return this.events.run(() =>
      this.prisma.$transaction(async (tx) => {
        const comment = await tx.comment.create({
          data: {
            workspaceId: task.workspaceId,
            taskId: task.id,
            authorId: userId,
            body: dto.body.trim(),
          },
          include: {
            author: { select: { id: true, name: true, email: true } },
          },
        });
        await this.events.activity(
          {
            workspaceId: task.workspaceId,
            actorId: userId,
            projectId: task.projectId,
            taskId: task.id,
            type: 'comment.created',
            metadata: { taskTitle: task.title },
          },
          tx,
        );
        const project = await tx.project.findUnique({
          where: { id: task.projectId },
          select: { ownerId: true, name: true },
        });
        const excerpt =
          comment.body.length > 140
            ? `${comment.body.slice(0, 137).trimEnd()}...`
            : comment.body;
        const body = `${comment.author.name} on "${task.title}": ${excerpt}`;
        const managers = await workspaceManagerIds(tx, task.workspaceId);
        const notified = new Set<string>([userId]);
        const watchers = [
          task.assigneeId,
          project?.ownerId,
          ...managers,
        ].filter((id): id is string => Boolean(id));
        for (const watcherId of watchers) {
          if (notified.has(watcherId)) continue;
          notified.add(watcherId);
          const assigned = watcherId === task.assigneeId;
          const ownsProject = watcherId === project?.ownerId;
          await this.events.notify(
            {
              workspaceId: task.workspaceId,
              userId: watcherId,
              type: assigned
                ? 'task.commented'
                : ownsProject
                  ? 'project.task_commented'
                  : 'workspace.task_commented',
              title: assigned
                ? 'New comment on your task'
                : ownsProject
                  ? 'New comment in your project'
                  : `New comment in ${project?.name ?? 'a project'}`,
              body: assigned ? body : `${body} (${project?.name ?? 'Project'})`,
              resourceType: 'task',
              resourceId: task.id,
            },
            tx,
          );
        }
        return { comment };
      }),
    );
  }
}
