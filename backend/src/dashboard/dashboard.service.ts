import { Injectable } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async get(userId: string, workspaceId: string) {
    await this.access.requireMembership(userId, workspaceId);
    const now = new Date();
    // Due dates are stored as UTC midnight, so "overdue" means before today
    // in UTC, not before this exact moment.
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const soon = new Date(today);
    soon.setUTCDate(soon.getUTCDate() + 7);
    const staleSince = new Date(now);
    staleSince.setDate(staleSince.getDate() - 7);

    const open = { not: TaskStatus.DONE };
    const overdueWhere = { workspaceId, status: open, dueDate: { lt: today } };
    const upcomingWhere = {
      workspaceId,
      status: open,
      dueDate: { gte: today, lte: soon },
    };
    const staleWhere = {
      workspaceId,
      status: open,
      updatedAt: { lt: staleSince },
    };
    const taskPreview = {
      project: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
    };

    const [
      myTasks,
      recentProjects,
      recentActivity,
      counts,
      overdueTasks,
      upcomingTasks,
      staleTasks,
      projectHealth,
      memberCount,
      unreadCount,
      activeProjectCount,
      overdueCount,
      upcomingCount,
      staleCount,
      myOpenCount,
      myOverdueCount,
    ] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          workspaceId,
          assigneeId: userId,
          status: { not: TaskStatus.DONE },
        },
        include: {
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true } },
        },
        orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
        take: 8,
      }),
      this.prisma.project.findMany({
        where: { workspaceId, archivedAt: null },
        include: { _count: { select: { tasks: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 6,
      }),
      this.prisma.activityEvent.findMany({
        where: { workspaceId },
        include: {
          actor: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
          task: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
      this.prisma.task.groupBy({
        by: ['status'],
        where: { workspaceId },
        _count: { _all: true },
      }),
      this.prisma.task.findMany({
        where: overdueWhere,
        include: taskPreview,
        orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
        take: 8,
      }),
      this.prisma.task.findMany({
        where: upcomingWhere,
        include: taskPreview,
        orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
        take: 8,
      }),
      this.prisma.task.findMany({
        where: staleWhere,
        include: taskPreview,
        orderBy: { updatedAt: 'asc' },
        take: 8,
      }),
      this.prisma.project.findMany({
        where: { workspaceId, archivedAt: null },
        include: {
          tasks: {
            select: {
              id: true,
              status: true,
              dueDate: true,
              updatedAt: true,
            },
          },
          _count: { select: { tasks: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 8,
      }),
      this.prisma.workspaceMember.count({ where: { workspaceId } }),
      this.prisma.notification.count({
        where: { workspaceId, userId, readAt: null },
      }),
      this.prisma.project.count({
        where: { workspaceId, archivedAt: null },
      }),
      this.prisma.task.count({ where: overdueWhere }),
      this.prisma.task.count({ where: upcomingWhere }),
      this.prisma.task.count({ where: staleWhere }),
      this.prisma.task.count({
        where: { workspaceId, assigneeId: userId, status: open },
      }),
      this.prisma.task.count({
        where: { ...overdueWhere, assigneeId: userId },
      }),
    ]);

    const taskCounts = counts.reduce(
      (acc, row) => {
        acc[row.status] = row._count._all;
        return acc;
      },
      {} as Record<string, number>,
    );
    const openCount =
      (taskCounts[TaskStatus.TODO] ?? 0) +
      (taskCounts[TaskStatus.IN_PROGRESS] ?? 0) +
      (taskCounts[TaskStatus.IN_REVIEW] ?? 0);

    return {
      myTasks,
      recentProjects,
      recentActivity,
      overdueTasks,
      upcomingTasks,
      staleTasks,
      unreadCount,
      memberCount,
      taskCounts,
      summary: {
        totalTasks: openCount + (taskCounts[TaskStatus.DONE] ?? 0),
        openTasks: openCount,
        doneTasks: taskCounts[TaskStatus.DONE] ?? 0,
        overdueTasks: overdueCount,
        staleTasks: staleCount,
        upcomingTasks: upcomingCount,
        myOpenTasks: myOpenCount,
        myOverdueTasks: myOverdueCount,
        activeProjects: activeProjectCount,
        memberCount,
        unreadCount,
      },
      projectHealth: projectHealth.map((project) => {
        const overdue = project.tasks.filter(
          (task) =>
            task.status !== TaskStatus.DONE &&
            task.dueDate &&
            task.dueDate < today,
        ).length;
        const stale = project.tasks.filter(
          (task) =>
            task.status !== TaskStatus.DONE && task.updatedAt < staleSince,
        ).length;
        const done = project.tasks.filter(
          (task) => task.status === TaskStatus.DONE,
        ).length;
        return {
          id: project.id,
          name: project.name,
          status: project.status,
          totalTasks: project._count.tasks,
          openTasks: project._count.tasks - done,
          doneTasks: done,
          overdueTasks: overdue,
          staleTasks: stale,
          updatedAt: project.updatedAt,
        };
      }),
    };
  }
}
