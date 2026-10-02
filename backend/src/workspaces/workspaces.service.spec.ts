import { ForbiddenException } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { WorkspacesService } from './workspaces.service';

describe('WorkspacesService role hierarchy', () => {
  const prisma = {
    workspaceMember: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    workspaceInvite: { upsert: jest.fn() },
    auditEvent: { create: jest.fn() },
    projectMember: { deleteMany: jest.fn() },
    task: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const access = {
    requireMembership: jest.fn(),
  };
  const service = new WorkspacesService(prisma as never, access as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prevents an admin from inviting another admin', async () => {
    access.requireMembership.mockResolvedValue({ role: WorkspaceRole.ADMIN });

    await expect(
      service.invite('admin', 'workspace', {
        email: 'new-admin@example.com',
        role: WorkspaceRole.ADMIN,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('prevents an admin from promoting a member to admin', async () => {
    access.requireMembership.mockResolvedValue({ role: WorkspaceRole.ADMIN });
    prisma.workspaceMember.findUnique.mockResolvedValue({
      id: 'membership',
      role: WorkspaceRole.MEMBER,
    });

    await expect(
      service.updateMemberRole(
        'admin',
        'workspace',
        'member',
        WorkspaceRole.ADMIN,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('prevents an admin from demoting another admin', async () => {
    access.requireMembership.mockResolvedValue({ role: WorkspaceRole.ADMIN });
    prisma.workspaceMember.findUnique.mockResolvedValue({
      id: 'membership',
      role: WorkspaceRole.ADMIN,
    });

    await expect(
      service.updateMemberRole(
        'admin',
        'workspace',
        'other-admin',
        WorkspaceRole.MEMBER,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('prevents an admin from removing another admin', async () => {
    access.requireMembership.mockResolvedValue({ role: WorkspaceRole.ADMIN });
    prisma.workspaceMember.findUnique.mockResolvedValue({
      id: 'membership',
      role: WorkspaceRole.ADMIN,
    });

    await expect(
      service.removeMember('admin', 'workspace', 'other-admin'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
