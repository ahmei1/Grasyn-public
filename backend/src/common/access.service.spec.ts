import { ForbiddenException } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { AccessService, canManageMembers } from './access.service';

describe('AccessService tenant isolation', () => {
  const prisma = {
    workspaceMember: { findUnique: jest.fn() },
    project: { findUnique: jest.fn() },
    task: { findUnique: jest.fn() },
  };
  const access = new AccessService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows members of the workspace', async () => {
    prisma.workspaceMember.findUnique.mockResolvedValue({
      role: WorkspaceRole.MEMBER,
    });
    await expect(
      access.requireMembership('user-a', 'workspace-a'),
    ).resolves.toEqual({ role: WorkspaceRole.MEMBER });
  });

  it('blocks users who are not members of the workspace', async () => {
    prisma.workspaceMember.findUnique.mockResolvedValue(null);
    await expect(
      access.requireMembership('user-b', 'workspace-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not allow a member of workspace B to read workspace A data', async () => {
    prisma.workspaceMember.findUnique.mockImplementation(
      ({
        where,
      }: {
        where: { workspaceId_userId: { workspaceId: string; userId: string } };
      }) => {
        if (
          where.workspaceId_userId.workspaceId === 'ws-b' &&
          where.workspaceId_userId.userId === 'user-b'
        ) {
          return Promise.resolve({ role: WorkspaceRole.MEMBER });
        }
        return Promise.resolve(null);
      },
    );

    await expect(
      access.requireMembership('user-b', 'ws-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      access.requireMembership('user-b', 'ws-b'),
    ).resolves.toBeTruthy();
  });
});

describe('RBAC helpers', () => {
  it('lets owners and admins manage members', () => {
    expect(canManageMembers(WorkspaceRole.OWNER)).toBe(true);
    expect(canManageMembers(WorkspaceRole.ADMIN)).toBe(true);
    expect(canManageMembers(WorkspaceRole.MEMBER)).toBe(false);
  });
});

describe('AccessService task and project permissions', () => {
  const prisma = {
    workspaceMember: { findUnique: jest.fn() },
    project: { findUnique: jest.fn() },
    task: { findUnique: jest.fn() },
  };
  const access = new AccessService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function membership(role: WorkspaceRole) {
    prisma.workspaceMember.findUnique.mockResolvedValue({ role });
  }

  it('lets an assigned member update status and description', async () => {
    membership(WorkspaceRole.MEMBER);
    await expect(
      access.requireTaskUpdatePermission(
        'member',
        { workspaceId: 'ws', assigneeId: 'member' },
        { status: 'DONE', description: 'Finished' },
      ),
    ).resolves.toEqual({ role: WorkspaceRole.MEMBER });
  });

  it('rejects a planning field even when the member is assigned', async () => {
    membership(WorkspaceRole.MEMBER);
    await expect(
      access.requireTaskUpdatePermission(
        'member',
        { workspaceId: 'ws', assigneeId: 'member' },
        { status: 'DONE', title: 'Changed plan' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects task updates from a member who is not the assignee', async () => {
    membership(WorkspaceRole.MEMBER);
    await expect(
      access.requireTaskUpdatePermission(
        'member',
        { workspaceId: 'ws', assigneeId: 'someone-else' },
        { status: 'DONE' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets admins and owners update any task field', async () => {
    for (const role of [WorkspaceRole.ADMIN, WorkspaceRole.OWNER]) {
      membership(role);
      await expect(
        access.requireTaskUpdatePermission(
          'manager',
          { workspaceId: 'ws', assigneeId: null },
          { title: 'Replanned', assigneeId: 'member', dueDate: null },
        ),
      ).resolves.toEqual({ role });
    }
  });

  it('allows members to create only basic tasks', async () => {
    membership(WorkspaceRole.MEMBER);
    await expect(
      access.requireTaskCreatePermission('member', 'ws', {
        title: 'Basic task',
        description: 'Details',
      }),
    ).resolves.toEqual({ role: WorkspaceRole.MEMBER });
    await expect(
      access.requireTaskCreatePermission('member', 'ws', {
        title: 'Planned task',
        priority: 'HIGH',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows only assignees or managers to move a task', async () => {
    membership(WorkspaceRole.MEMBER);
    await expect(
      access.requireTaskMovePermission('member', {
        workspaceId: 'ws',
        assigneeId: 'member',
      }),
    ).resolves.toEqual({ role: WorkspaceRole.MEMBER });
    await expect(
      access.requireTaskMovePermission('member', {
        workspaceId: 'ws',
        assigneeId: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    membership(WorkspaceRole.ADMIN);
    await expect(
      access.requireTaskMovePermission('admin', {
        workspaceId: 'ws',
        assigneeId: null,
      }),
    ).resolves.toEqual({ role: WorkspaceRole.ADMIN });
  });

  it('allows the project creator or a manager to manage a project', async () => {
    membership(WorkspaceRole.MEMBER);
    await expect(
      access.requireProjectManagement('creator', {
        workspaceId: 'ws',
        ownerId: 'creator',
      }),
    ).resolves.toEqual({ role: WorkspaceRole.MEMBER });
    await expect(
      access.requireProjectManagement('other-member', {
        workspaceId: 'ws',
        ownerId: 'creator',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    membership(WorkspaceRole.OWNER);
    await expect(
      access.requireProjectManagement('owner', {
        workspaceId: 'ws',
        ownerId: 'creator',
      }),
    ).resolves.toEqual({ role: WorkspaceRole.OWNER });
  });
});
