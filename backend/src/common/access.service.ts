import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type TaskAccess = {
  workspaceId: string;
  assigneeId: string | null;
};

type ProjectAccess = {
  workspaceId: string;
  ownerId: string;
};

const MEMBER_TASK_UPDATE_FIELDS = new Set(['status', 'description']);
const MEMBER_TASK_CREATE_FIELDS = new Set(['title', 'description']);

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async requireMembership(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You are not a member of this workspace',
      });
    }
    return membership;
  }

  async requireRoles(
    userId: string,
    workspaceId: string,
    roles: WorkspaceRole[],
  ) {
    const membership = await this.requireMembership(userId, workspaceId);
    if (!roles.includes(membership.role)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to do this',
      });
    }
    return membership;
  }

  async requireProject(userId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Project not found',
      });
    }
    await this.requireMembership(userId, project.workspaceId);
    return project;
  }

  async requireTask(userId: string, taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });
    if (!task) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Task not found',
      });
    }
    await this.requireMembership(userId, task.workspaceId);
    return task;
  }

  async requireTaskCreatePermission(
    userId: string,
    workspaceId: string,
    input: object,
  ) {
    const membership = await this.requireMembership(userId, workspaceId);
    if (isWorkspaceManager(membership.role)) return membership;

    const forbidden = presentFields(input).filter(
      (field) => !MEMBER_TASK_CREATE_FIELDS.has(field),
    );
    if (forbidden.length > 0) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message:
          'Only workspace admins can set task status, priority, assignee, or due date',
      });
    }
    return membership;
  }

  async requireTaskUpdatePermission(
    userId: string,
    task: TaskAccess,
    input: object,
  ) {
    const membership = await this.requireMembership(userId, task.workspaceId);
    if (isWorkspaceManager(membership.role)) return membership;

    if (task.assigneeId !== userId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You can only update tasks assigned to you',
      });
    }

    const forbidden = presentFields(input).filter(
      (field) => !MEMBER_TASK_UPDATE_FIELDS.has(field),
    );
    if (forbidden.length > 0) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message:
          'Only workspace admins can change task title, priority, assignee, or due date',
      });
    }
    return membership;
  }

  async requireTaskMovePermission(userId: string, task: TaskAccess) {
    const membership = await this.requireMembership(userId, task.workspaceId);
    if (isWorkspaceManager(membership.role) || task.assigneeId === userId) {
      return membership;
    }
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'You can only move tasks assigned to you',
    });
  }

  async requireProjectManagement(userId: string, project: ProjectAccess) {
    const membership = await this.requireMembership(
      userId,
      project.workspaceId,
    );
    if (isWorkspaceManager(membership.role) || project.ownerId === userId) {
      return membership;
    }
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Only the project creator or a workspace admin can do this',
    });
  }
}

export function canManageMembers(role: WorkspaceRole) {
  return isWorkspaceManager(role);
}

export function isWorkspaceManager(role: WorkspaceRole) {
  return role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN;
}

function presentFields(input: object) {
  const record = input as Record<string, unknown>;
  return Object.keys(record).filter((field) => record[field] !== undefined);
}
