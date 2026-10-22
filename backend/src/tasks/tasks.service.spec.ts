import { ForbiddenException } from '@nestjs/common';
import { TasksService } from './tasks.service';

describe('TasksService permissions', () => {
  const prisma = {
    $transaction: jest.fn(),
  };
  const access = {
    requireProject: jest.fn(),
    requireTask: jest.fn(),
    requireMembership: jest.fn(),
    requireTaskCreatePermission: jest.fn(),
    requireTaskUpdatePermission: jest.fn(),
    requireTaskMovePermission: jest.fn(),
  };
  const events = {
    activity: jest.fn(),
    notify: jest.fn(),
    run: (work: () => unknown) => work(),
  };
  const service = new TasksService(
    prisma as never,
    access as never,
    events as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not write when task creation permission is denied', async () => {
    access.requireProject.mockResolvedValue({
      id: 'project',
      workspaceId: 'workspace',
    });
    access.requireTaskCreatePermission.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(
      service.create('member', 'project', {
        title: 'Task',
        priority: 'HIGH',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not write when task update permission is denied', async () => {
    access.requireTask.mockResolvedValue({
      id: 'task',
      projectId: 'project',
      workspaceId: 'workspace',
      assigneeId: 'other-member',
    });
    access.requireTaskUpdatePermission.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(
      service.update('member', 'task', { status: 'DONE' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not write when task move permission is denied', async () => {
    access.requireTask.mockResolvedValue({
      id: 'task',
      projectId: 'project',
      workspaceId: 'workspace',
      assigneeId: null,
    });
    access.requireTaskMovePermission.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(
      service.move('member', 'task', {
        status: 'IN_PROGRESS',
        position: 0,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
