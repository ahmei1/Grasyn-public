import { Injectable } from '@nestjs/common';
import { Prisma, TaskPriority, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { EventsService } from '../common/events.service';
import { paginationMeta } from '../common/dto/pagination.dto';
import { workspaceManagerIds } from '../common/workspace-managers';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';
import {
  changedTaskFields,
  describeTaskChanges,
  joinPhrases,
  taskChangeTitle,
  type TaskField,
  type TaskSnapshot,
} from './task-changes';

const taskInclude = {
  assignee: { select: { id: true, name: true, email: true } },
  creator: { select: { id: true, name: true, email: true } },
  project: { select: { id: true, name: true } },
  _count: { select: { comments: true } },
} as const;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly events: EventsService,
  ) {}

  /**
   * `afterCreate` runs inside the same transaction, so callers that link the
   * new task to something else (a meeting action item) fail as one unit.
   */
  async create(
    userId: string,
    projectId: string,
    dto: CreateTaskDto,
    afterCreate?: (
      tx: Prisma.TransactionClient,
      task: { id: string },
    ) => Promise<void>,
  ) {
    const project = await this.access.requireProject(userId, projectId);
    await this.access.requireTaskCreatePermission(
      userId,
      project.workspaceId,
      dto,
    );
    if (dto.assigneeId) {
      await this.access.requireMembership(dto.assigneeId, project.workspaceId);
    }
    return this.events.run(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
        // The increment locks the workspace row, so concurrent creates in
        // any project get distinct numbers.
        const { taskCounter: number } = await tx.workspace.update({
          where: { id: project.workspaceId },
          data: { taskCounter: { increment: 1 } },
          select: { taskCounter: true },
        });
        const last = await tx.task.findFirst({
          where: { projectId, status: dto.status ?? TaskStatus.TODO },
          orderBy: { position: 'desc' },
        });
        const task = await tx.task.create({
          data: {
            workspaceId: project.workspaceId,
            projectId,
            number,
            title: dto.title.trim(),
            description: dto.description?.trim() ?? '',
            status: dto.status ?? TaskStatus.TODO,
            priority: dto.priority ?? TaskPriority.MEDIUM,
            assigneeId: dto.assigneeId || null,
            creatorId: userId,
            dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
            position: (last?.position ?? -1) + 1,
          },
          include: taskInclude,
        });
        await this.events.activity(
          {
            workspaceId: project.workspaceId,
            actorId: userId,
            projectId,
            taskId: task.id,
            type: 'task.created',
            metadata: {
              title: task.title,
              assigneeId: task.assigneeId,
              priority: task.priority,
              dueDate: task.dueDate?.toISOString() ?? null,
            },
          },
          tx,
        );
        await this.events.audit(
          {
            workspaceId: project.workspaceId,
            actorId: userId,
            action: 'task.created',
            metadata: {
              taskId: task.id,
              projectId,
              title: task.title,
              assigneeId: task.assigneeId,
            },
          },
          tx,
        );
        const actorName = task.creator?.name ?? 'Someone';
        const notified = new Set<string>([userId]);
        if (task.assigneeId && !notified.has(task.assigneeId)) {
          notified.add(task.assigneeId);
          await this.events.notify(
            {
              workspaceId: project.workspaceId,
              userId: task.assigneeId,
              type: 'task.assigned',
              title: 'Task assigned to you',
              body: `${actorName} assigned you "${task.title}" in ${project.name}.`,
              resourceType: 'task',
              resourceId: task.id,
            },
            tx,
          );
        }
        const managers = await workspaceManagerIds(tx, project.workspaceId);
        for (const watcherId of [project.ownerId, ...managers]) {
          if (notified.has(watcherId)) continue;
          notified.add(watcherId);
          const ownsProject = watcherId === project.ownerId;
          await this.events.notify(
            {
              workspaceId: project.workspaceId,
              userId: watcherId,
              type: ownsProject
                ? 'project.task_created'
                : 'workspace.task_created',
              title: ownsProject
                ? 'New task in your project'
                : `New task in ${project.name}`,
              body: `${actorName} added "${task.title}" to ${project.name}.`,
              resourceType: 'task',
              resourceId: task.id,
            },
            tx,
          );
        }
        if (afterCreate) await afterCreate(tx, task);
        return { task };
      }),
    );
  }

  async listForProject(
    userId: string,
    projectId: string,
    query: {
      status?: TaskStatus;
      priority?: TaskPriority;
      assignee?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const project = await this.access.requireProject(userId, projectId);
    return this.queryTasks(userId, project.workspaceId, {
      ...query,
      projectId,
    });
  }

  async listForWorkspace(
    userId: string,
    workspaceId: string,
    query: {
      status?: TaskStatus;
      priority?: TaskPriority;
      assignee?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    await this.access.requireMembership(userId, workspaceId);
    return this.queryTasks(userId, workspaceId, query);
  }

  async getOne(userId: string, taskId: string) {
    const existing = await this.access.requireTask(userId, taskId);
    const task = await this.prisma.task.findUnique({
      where: { id: existing.id },
      include: taskInclude,
    });
    return { task };
  }

  async update(userId: string, taskId: string, dto: UpdateTaskDto) {
    const existing = await this.access.requireTask(userId, taskId);
    await this.access.requireTaskUpdatePermission(userId, existing, dto);
    if (dto.assigneeId) {
      await this.access.requireMembership(dto.assigneeId, existing.workspaceId);
    }
    return this.events.run(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${existing.projectId} FOR UPDATE`;
        const current = await tx.task.findUniqueOrThrow({
          where: { id: taskId },
        });
        const project = await tx.project.findUniqueOrThrow({
          where: { id: current.projectId },
          select: { ownerId: true, name: true },
        });
        let position = current.position;
        if (dto.status && dto.status !== current.status) {
          position = await this.reposition(tx, current, dto.status);
        }
        const task = await tx.task.update({
          where: { id: existing.id },
          data: {
            position,
            ...(dto.title ? { title: dto.title.trim() } : {}),
            ...(dto.description !== undefined
              ? { description: dto.description.trim() }
              : {}),
            ...(dto.status ? { status: dto.status } : {}),
            ...(dto.priority ? { priority: dto.priority } : {}),
            ...(dto.assigneeId !== undefined
              ? { assigneeId: dto.assigneeId || null }
              : {}),
            ...(dto.dueDate !== undefined
              ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }
              : {}),
          },
          include: taskInclude,
        });
        const changes = changedTaskFields(current, task);
        if (changes.length === 0) return { task };
        await this.recordTaskChange(tx, {
          actorId: userId,
          workspaceId: existing.workspaceId,
          project,
          previous: current,
          task,
          changes,
          activityType:
            current.status !== task.status
              ? 'task.status_changed'
              : current.assigneeId !== task.assigneeId
                ? 'task.reassigned'
                : 'task.updated',
        });
        return { task };
      }),
    );
  }

  // Writes the activity, audit and notification rows for a task change so
  // every surface describes the change the same way.
  private async recordTaskChange(
    tx: Prisma.TransactionClient,
    input: {
      actorId: string;
      workspaceId: string;
      project: { ownerId: string; name: string };
      previous: TaskSnapshot;
      task: TaskSnapshot & {
        id: string;
        projectId: string;
        assignee: { name: string } | null;
      };
      changes: TaskField[];
      activityType: string;
      extraMetadata?: Record<string, unknown>;
    },
  ) {
    const { actorId, workspaceId, project, previous, task, changes } = input;
    const [actor, previousAssignee] = await Promise.all([
      tx.user.findUnique({ where: { id: actorId }, select: { name: true } }),
      previous.assigneeId && previous.assigneeId !== task.assigneeId
        ? tx.user.findUnique({
            where: { id: previous.assigneeId },
            select: { name: true },
          })
        : null,
    ]);
    const actorName = actor?.name ?? 'Someone';
    const assigneeName = task.assignee?.name ?? null;
    const details = {
      title: task.title,
      changes,
      previousStatus: previous.status,
      status: task.status,
      previousPriority: previous.priority,
      priority: task.priority,
      previousDueDate: previous.dueDate?.toISOString() ?? null,
      dueDate: task.dueDate?.toISOString() ?? null,
      previousAssigneeId: previous.assigneeId,
      previousAssigneeName:
        previousAssignee?.name ??
        (previous.assigneeId === task.assigneeId ? assigneeName : null),
      assigneeId: task.assigneeId,
      assigneeName,
      ...input.extraMetadata,
    };
    await this.events.activity(
      {
        workspaceId,
        actorId,
        projectId: task.projectId,
        taskId: task.id,
        type: input.activityType,
        metadata: details,
      },
      tx,
    );
    await this.events.audit(
      {
        workspaceId,
        actorId,
        action: input.activityType,
        metadata: { taskId: task.id, projectId: task.projectId, ...details },
      },
      tx,
    );

    const summary = joinPhrases(
      describeTaskChanges(changes, previous, task, assigneeName),
    );
    const body = `On "${task.title}" (${project.name}), ${actorName} ${summary}.`;
    const notified = new Set<string>([actorId]);
    if (
      task.assigneeId &&
      changes.includes('assignee') &&
      !notified.has(task.assigneeId)
    ) {
      notified.add(task.assigneeId);
      await this.events.notify(
        {
          workspaceId,
          userId: task.assigneeId,
          type: 'task.assigned',
          title: 'Task assigned to you',
          body: `${actorName} assigned you "${task.title}" in ${project.name}.`,
          resourceType: 'task',
          resourceId: task.id,
        },
        tx,
      );
    }
    const managers = await workspaceManagerIds(tx, workspaceId);
    const watchers = [task.assigneeId, project.ownerId, ...managers].filter(
      (id): id is string => Boolean(id),
    );
    for (const watcherId of watchers) {
      if (notified.has(watcherId)) continue;
      notified.add(watcherId);
      await this.events.notify(
        {
          workspaceId,
          userId: watcherId,
          type:
            watcherId === task.assigneeId
              ? 'task.updated'
              : watcherId === project.ownerId
                ? 'project.task_updated'
                : 'workspace.task_updated',
          title: taskChangeTitle(changes),
          body,
          resourceType: 'task',
          resourceId: task.id,
        },
        tx,
      );
    }
  }

  async move(userId: string, taskId: string, dto: MoveTaskDto) {
    const existing = await this.access.requireTask(userId, taskId);
    await this.access.requireTaskMovePermission(userId, existing);
    return this.events.run(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${existing.projectId} FOR UPDATE`;
        const current = await tx.task.findUniqueOrThrow({
          where: { id: taskId },
        });
        const position = await this.reposition(
          tx,
          current,
          dto.status,
          dto.position,
        );
        const task = await tx.task.update({
          where: { id: existing.id },
          data: { status: dto.status, position },
          include: taskInclude,
        });
        // Reordering inside the same column is not worth a history entry,
        // but other open boards still need the new order.
        if (current.status === task.status) {
          this.events.publish({
            room: `workspace:${existing.workspaceId}`,
            event: 'activity',
            data: {
              type: 'task.reordered',
              workspaceId: existing.workspaceId,
              projectId: current.projectId,
              taskId: task.id,
            },
          });
          return { task };
        }
        const project = await tx.project.findUniqueOrThrow({
          where: { id: current.projectId },
          select: { ownerId: true, name: true },
        });
        await this.recordTaskChange(tx, {
          actorId: userId,
          workspaceId: existing.workspaceId,
          project,
          previous: current,
          task,
          changes: ['status'],
          activityType: 'task.moved',
          extraMetadata: { position },
        });
        return { task };
      }),
    );
  }

  // Caller holds the project row lock. Re-number siblings so inserts never tie.
  private async reposition(
    tx: Prisma.TransactionClient,
    current: { id: string; projectId: string; status: TaskStatus },
    status: TaskStatus,
    requested?: number,
  ) {
    const siblings = await tx.task.findMany({
      where: { projectId: current.projectId, status, id: { not: current.id } },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, updatedAt: true },
    });
    const position = Math.min(requested ?? siblings.length, siblings.length);
    // Renumbering is bookkeeping, so keep updatedAt or stale detection breaks.
    for (const [index, sibling] of siblings.entries()) {
      await tx.task.update({
        where: { id: sibling.id },
        data: {
          position: index < position ? index : index + 1,
          updatedAt: sibling.updatedAt,
        },
      });
    }
    if (current.status !== status) {
      const previous = await tx.task.findMany({
        where: {
          projectId: current.projectId,
          status: current.status,
          id: { not: current.id },
        },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, updatedAt: true },
      });
      for (const [index, sibling] of previous.entries()) {
        await tx.task.update({
          where: { id: sibling.id },
          data: { position: index, updatedAt: sibling.updatedAt },
        });
      }
    }
    return position;
  }

  private async queryTasks(
    userId: string,
    workspaceId: string,
    query: {
      projectId?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      assignee?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.TaskWhereInput = {
      workspaceId,
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.assignee === 'me' ? { assigneeId: userId } : {}),
      ...(query.assignee && query.assignee !== 'me'
        ? { assigneeId: query.assignee }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        include: taskInclude,
        orderBy: [
          { status: 'asc' },
          { position: 'asc' },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.task.count({ where }),
    ]);
    return { tasks: items, meta: paginationMeta(total, page, pageSize) };
  }
}
