import { CommentsService } from './comments.service';

function setup(assigneeId: string | null = 'assignee') {
  const tx = {
    comment: {
      create: jest.fn().mockResolvedValue({
        body: 'Looks good',
        author: { name: 'Sam' },
      }),
    },
    project: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ ownerId: 'owner', name: 'Website' }),
    },
    workspaceMember: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ userId: 'owner' }, { userId: 'admin' }]),
    },
  };
  const prisma = {
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const access = {
    requireTask: jest.fn().mockResolvedValue({
      id: 'task',
      workspaceId: 'workspace',
      projectId: 'project',
      title: 'Ship login',
      assigneeId,
    }),
  };
  const events = {
    activity: jest.fn(),
    notify: jest.fn(),
    run: (work: () => unknown) => work(),
  };
  const service = new CommentsService(
    prisma as never,
    access as never,
    events as never,
  );
  const notified = () =>
    events.notify.mock.calls.map(([n]: [{ userId: string; type: string }]) => [
      n.userId,
      n.type,
    ]);
  return { service, notified };
}

describe('CommentsService notifications', () => {
  it('notifies the assignee, the project owner, and admins once each', async () => {
    const { service, notified } = setup();

    await service.create('member', 'task', { body: 'Looks good' });

    expect(notified()).toEqual([
      ['assignee', 'task.commented'],
      ['owner', 'project.task_commented'],
      ['admin', 'workspace.task_commented'],
    ]);
  });

  it('never notifies the commenter', async () => {
    const { service, notified } = setup();

    await service.create('admin', 'task', { body: 'Looks good' });

    expect(notified()).toEqual([
      ['assignee', 'task.commented'],
      ['owner', 'project.task_commented'],
    ]);
  });

  it('still reaches admins when the task has no assignee', async () => {
    const { service, notified } = setup(null);

    await service.create('member', 'task', { body: 'Looks good' });

    expect(notified()).toEqual([
      ['owner', 'project.task_commented'],
      ['admin', 'workspace.task_commented'],
    ]);
  });
});
