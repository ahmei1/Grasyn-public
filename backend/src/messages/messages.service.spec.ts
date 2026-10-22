import { ForbiddenException } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { MessagesService } from './messages.service';

function setup(
  role: WorkspaceRole = WorkspaceRole.MEMBER,
  { unread = null as { id: string } | null } = {},
) {
  const tx = {
    message: {
      create: jest.fn().mockResolvedValue({
        id: 'msg',
        authorId: 'author',
        body: 'Hi team',
        author: { name: 'Sam' },
      }),
      findMany: jest
        .fn()
        .mockResolvedValue([
          { authorId: 'author' },
          { authorId: 'poster' },
          { authorId: 'left-workspace' },
        ]),
    },
    projectMember: {
      findMany: jest.fn().mockResolvedValue([{ userId: 'member' }]),
    },
    task: {
      findMany: jest.fn().mockResolvedValue([{ assigneeId: 'assignee' }]),
    },
    workspaceMember: {
      findMany: jest.fn(({ where }: { where: { role?: unknown } }) =>
        Promise.resolve(
          where.role
            ? [{ userId: 'owner' }, { userId: 'admin' }]
            : ['owner', 'admin', 'member', 'poster', 'assignee'].map(
                (userId) => ({
                  userId,
                }),
              ),
        ),
      ),
    },
    notification: {
      findFirst: jest.fn().mockResolvedValue(unread),
      update: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
    notification: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    message: {
      findMany: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({
        id: 'msg',
        workspaceId: 'workspace',
        projectId: 'project',
        authorId: 'author',
      }),
      create: jest.fn().mockResolvedValue({ id: 'msg', body: 'Hi' }),
      update: jest.fn().mockResolvedValue({ id: 'msg', body: 'Edited' }),
      delete: jest.fn(),
    },
  };
  const access = {
    requireProject: jest.fn().mockResolvedValue({
      id: 'project',
      workspaceId: 'workspace',
      ownerId: 'owner',
      name: 'Website',
    }),
    requireMembership: jest.fn().mockResolvedValue({ role }),
  };
  const events = {
    publish: jest.fn(),
    notify: jest.fn(),
    run: (work: () => unknown) => work(),
  };
  const service = new MessagesService(
    prisma as never,
    access as never,
    events as never,
  );
  const notified = () =>
    events.notify.mock.calls.map(([n]: [{ userId: string }]) => n.userId);
  return { service, prisma, tx, events, notified };
}

describe('MessagesService', () => {
  it('returns the newest page in reading order and says if there is more', async () => {
    const { service, prisma } = setup();
    prisma.message.findMany.mockResolvedValue([
      { id: 'c' },
      { id: 'b' },
      { id: 'a' },
    ]);

    const result = await service.listForProject('user', 'project', {
      limit: 2,
    });

    expect(result).toEqual({
      messages: [{ id: 'b' }, { id: 'c' }],
      hasMore: true,
    });
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3 }),
    );
  });

  it('pages backwards from a message id', async () => {
    const { service, prisma } = setup();
    prisma.message.findMany.mockResolvedValue([]);

    await service.listForProject('user', 'project', {
      before: 'cmsgcursor0000000000000000',
      limit: 50,
    });

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: 'cmsgcursor0000000000000000' },
        skip: 1,
      }),
    );
  });

  it('sends new messages only to people viewing the project', async () => {
    const { service, events } = setup();

    await service.create('user', 'project', { body: 'Hi' });

    expect(events.publish).toHaveBeenCalledWith({
      room: 'project:project',
      event: 'message',
      data: {
        type: 'message.created',
        workspaceId: 'workspace',
        projectId: 'project',
      },
    });
  });

  it('notifies project followers once each, never the author or ex-members', async () => {
    const { service, events, notified } = setup();

    await service.create('author', 'project', { body: 'Hi team' });

    expect(notified().sort()).toEqual([
      'admin',
      'assignee',
      'member',
      'owner',
      'poster',
    ]);
    expect(events.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'project.message',
        title: 'New message in Website',
        body: 'Sam: Hi team',
        resourceType: 'project',
        resourceId: 'project',
      }),
      expect.anything(),
    );
  });

  it('refreshes an unread discussion notification instead of adding another', async () => {
    const { service, tx, events } = setup(WorkspaceRole.MEMBER, {
      unread: { id: 'old' },
    });

    await service.create('author', 'project', { body: 'Hi team' });

    expect(events.notify).not.toHaveBeenCalled();
    expect(tx.notification.update).toHaveBeenCalledWith({
      where: { id: 'old' },
      data: {
        title: 'New messages in Website',
        body: 'Sam: Hi team',
        createdAt: expect.any(Date) as Date,
      },
    });
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ room: 'user:owner', event: 'notification' }),
    );
  });

  it('clears only this project’s discussion notifications when read', async () => {
    const { service, prisma, events } = setup();

    await service.markRead('owner', 'project');

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'owner',
        workspaceId: 'workspace',
        type: 'project.message',
        resourceId: 'project',
        readAt: null,
      },
      data: { readAt: expect.any(Date) as Date },
    });
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ room: 'user:owner', event: 'notification' }),
    );
  });

  it('lets only the author edit a message', async () => {
    const { service, prisma } = setup(WorkspaceRole.OWNER);

    await expect(
      service.update('someone-else', 'msg', { body: 'Edited' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.message.update).not.toHaveBeenCalled();

    await service.update('author', 'msg', { body: 'Edited' });
    expect(prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { body: 'Edited', editedAt: expect.any(Date) as Date },
      }),
    );
  });

  it('lets an admin delete someone else’s message but not a member', async () => {
    const member = setup(WorkspaceRole.MEMBER);
    await expect(
      member.service.remove('someone-else', 'msg'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(member.prisma.message.delete).not.toHaveBeenCalled();

    const admin = setup(WorkspaceRole.ADMIN);
    await admin.service.remove('someone-else', 'msg');
    expect(admin.prisma.message.delete).toHaveBeenCalledWith({
      where: { id: 'msg' },
    });
  });
});
