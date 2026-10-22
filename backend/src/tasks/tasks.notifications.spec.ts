import { TasksService } from './tasks.service';

// OWNER owns both the workspace and the project, as in a freshly created team.
const OWNER = 'owner';
const ADMIN = 'admin';
const ASSIGNEE = 'assignee';
const NEW_ASSIGNEE = 'new-assignee';
const OTHER = 'other-member';

const baseTask = {
  id: 'task',
  projectId: 'project',
  title: 'Ship login',
  description: '',
  status: 'TODO',
  priority: 'MEDIUM',
  position: 0,
  assigneeId: ASSIGNEE as string | null,
  dueDate: null,
};

function setup(current = baseTask) {
  const tx = {
    $queryRaw: jest.fn(),
    task: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(current),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const assigneeId =
          'assigneeId' in data
            ? (data.assigneeId as string | null)
            : current.assigneeId;
        return Promise.resolve({
          ...current,
          ...data,
          assigneeId,
          assignee: assigneeId ? { name: `${assigneeId} name` } : null,
        });
      }),
    },
    project: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ ownerId: OWNER, name: 'Website' }),
    },
    user: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({ name: `${where.id} name` }),
      ),
    },
    workspaceMember: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ userId: OWNER }, { userId: ADMIN }]),
    },
  };
  const prisma = {
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const access = {
    requireTask: jest.fn().mockResolvedValue({
      ...current,
      workspaceId: 'workspace',
    }),
    requireTaskUpdatePermission: jest.fn(),
    requireMembership: jest.fn(),
  };
  const events = {
    activity: jest.fn(),
    audit: jest.fn(),
    notify: jest.fn(),
    publish: jest.fn(),
    run: (work: () => unknown) => work(),
  };
  const service = new TasksService(
    prisma as never,
    access as never,
    events as never,
  );
  const notified = () =>
    events.notify.mock.calls.map(([n]: [{ userId: string; type: string }]) => [
      n.userId,
      n.type,
    ]);
  return { service, events, notified };
}

describe('TasksService notifications', () => {
  it('notifies the assignee, the owner, and admins once each, never the actor', async () => {
    const { service, notified } = setup();

    await service.update(OTHER, 'task', { priority: 'HIGH' });

    expect(notified()).toEqual([
      [ASSIGNEE, 'task.updated'],
      [OWNER, 'project.task_updated'],
      [ADMIN, 'workspace.task_updated'],
    ]);
  });

  it('does not notify the actor about their own change', async () => {
    const { service, notified } = setup();

    await service.update(ASSIGNEE, 'task', { priority: 'HIGH' });

    expect(notified()).toEqual([
      [OWNER, 'project.task_updated'],
      [ADMIN, 'workspace.task_updated'],
    ]);
  });

  it('does not notify an admin about a change they made', async () => {
    const { service, notified } = setup();

    await service.update(ADMIN, 'task', { priority: 'HIGH' });

    expect(notified()).toEqual([
      [ASSIGNEE, 'task.updated'],
      [OWNER, 'project.task_updated'],
    ]);
  });

  it('sends a new assignee only the assignment notification', async () => {
    const { service, notified } = setup();

    await service.update(OTHER, 'task', { assigneeId: NEW_ASSIGNEE });

    expect(notified()).toEqual([
      [NEW_ASSIGNEE, 'task.assigned'],
      [OWNER, 'project.task_updated'],
      [ADMIN, 'workspace.task_updated'],
    ]);
  });

  it('notifies an admin who is also the assignee only once', async () => {
    const { service, notified } = setup({ ...baseTask, assigneeId: ADMIN });

    await service.update(OTHER, 'task', { priority: 'HIGH' });

    expect(notified()).toEqual([
      [ADMIN, 'task.updated'],
      [OWNER, 'project.task_updated'],
    ]);
  });

  it('writes nothing when the update changes nothing', async () => {
    const { service, events } = setup();

    await service.update(OTHER, 'task', { priority: 'MEDIUM' });

    expect(events.activity).not.toHaveBeenCalled();
    expect(events.notify).not.toHaveBeenCalled();
  });

  it('describes the change in the notification body', async () => {
    const { service, events } = setup();

    await service.update(OTHER, 'task', { priority: 'HIGH' });

    const [[first]] = events.notify.mock.calls as [[{ body: string }]];
    expect(first.body).toContain('"Ship login" (Website)');
    expect(first.body).toContain(`${OTHER} name`);
  });
});
