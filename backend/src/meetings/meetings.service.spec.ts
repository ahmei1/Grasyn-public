import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { MeetingsService } from './meetings.service';

const meeting = {
  id: 'meeting',
  workspaceId: 'workspace',
  projectId: 'project',
  title: 'Sprint planning',
  startsAt: new Date('2026-10-14T09:00:00Z'),
  endsAt: null,
  notes: '',
  createdById: 'organizer',
  project: { id: 'project', name: 'Website', ownerId: 'owner' },
};

type SetupOptions = {
  role?: WorkspaceRole;
  seat?: object | null;
  workspaceCount?: number;
  item?: {
    id: string;
    title: string;
    assigneeId: string | null;
    dueDate: Date | null;
    taskId: string | null;
  };
  claimed?: number;
};

function setup({
  role = WorkspaceRole.MEMBER,
  seat = null,
  workspaceCount = 2,
  item = {
    id: 'item',
    title: 'Write docs',
    assigneeId: null,
    dueDate: null,
    taskId: null,
  },
  claimed = 1,
}: SetupOptions = {}) {
  const tx = {
    meeting: {
      create: jest.fn().mockResolvedValue(meeting),
      update: jest.fn(),
      delete: jest.fn(),
    },
    meetingParticipant: { findUnique: jest.fn(), create: jest.fn() },
    meetingActionItem: {
      updateMany: jest.fn().mockResolvedValue({ count: claimed }),
    },
  };
  const prisma = {
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
    meeting: {
      findUnique: jest.fn().mockResolvedValue(meeting),
      findUniqueOrThrow: jest.fn().mockResolvedValue(meeting),
    },
    meetingParticipant: { findUnique: jest.fn().mockResolvedValue(seat) },
    meetingDecision: { create: jest.fn() },
    meetingActionItem: { findFirst: jest.fn().mockResolvedValue(item) },
    workspaceMember: { count: jest.fn().mockResolvedValue(workspaceCount) },
  };
  const access = {
    requireProject: jest.fn().mockResolvedValue({
      id: 'project',
      workspaceId: 'workspace',
      name: 'Website',
    }),
    requireMembership: jest.fn().mockResolvedValue({ role }),
  };
  const events = {
    activity: jest.fn(),
    notify: jest.fn(),
    publish: jest.fn(),
    run: (work: () => unknown) => work(),
  };
  const tasks = {
    create: jest.fn(
      async (
        _user: string,
        _project: string,
        _dto: object,
        afterCreate: (client: typeof tx, task: { id: string }) => Promise<void>,
      ) => {
        await afterCreate(tx, { id: 'task' });
        return { task: { id: 'task' } };
      },
    ),
  };
  const service = new MeetingsService(
    prisma as never,
    access as never,
    events as never,
    tasks as never,
  );
  return { service, tx, prisma, events, tasks };
}

describe('MeetingsService', () => {
  it('seats the organizer and invitees, and notifies only the invitees', async () => {
    const { service, tx, events } = setup();

    await service.create('organizer', 'project', {
      title: 'Sprint planning',
      startsAt: '2026-10-14T09:00:00Z',
      participantIds: ['amy', 'ben', 'organizer', 'amy'],
    });

    const data = (
      tx.meeting.create.mock.calls[0] as [{ data: { participants: unknown } }]
    )[0].data;
    expect(data.participants).toEqual({
      create: [{ userId: 'organizer' }, { userId: 'amy' }, { userId: 'ben' }],
    });
    expect(
      events.notify.mock.calls.map(
        ([n]: [{ userId: string; type: string }]) => [n.userId, n.type],
      ),
    ).toEqual([
      ['amy', 'meeting.invited'],
      ['ben', 'meeting.invited'],
    ]);
    expect(events.activity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'meeting.created',
        meetingId: 'meeting',
      }),
      tx,
    );
  });

  it('refuses participants from outside the workspace', async () => {
    const { service, tx } = setup({ workspaceCount: 1 });

    await expect(
      service.create('organizer', 'project', {
        title: 'Sprint planning',
        startsAt: '2026-10-14T09:00:00Z',
        participantIds: ['amy', 'stranger'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.meeting.create).not.toHaveBeenCalled();
  });

  it('refuses a meeting that ends before it starts', async () => {
    const { service } = setup();

    await expect(
      service.create('organizer', 'project', {
        title: 'Sprint planning',
        startsAt: '2026-10-14T09:00:00Z',
        endsAt: '2026-10-14T08:00:00Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only lets participants, organizers, and admins edit', async () => {
    const outsider = setup();
    await expect(
      outsider.service.addDecision('someone', 'meeting', { body: 'Ship it' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const participant = setup({ seat: { id: 'seat' } });
    await participant.service.addDecision('someone', 'meeting', {
      body: 'Ship it',
    });
    expect(participant.prisma.meetingDecision.create).toHaveBeenCalled();

    const admin = setup({ role: WorkspaceRole.ADMIN });
    await admin.service.addDecision('someone', 'meeting', { body: 'Ship it' });
    expect(admin.prisma.meetingDecision.create).toHaveBeenCalled();
  });

  it('keeps note edits out of the activity feed but still refreshes viewers', async () => {
    const { service, events } = setup();

    await service.update('organizer', 'meeting', { notes: 'Agenda' });

    expect(events.activity).not.toHaveBeenCalled();
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        room: 'workspace:workspace',
        data: expect.objectContaining({
          type: 'meeting.changed',
          meetingId: 'meeting',
        }) as object,
      }),
    );
  });

  it('turns an action item into a task through normal task creation', async () => {
    const due = new Date('2026-10-20T00:00:00Z');
    const { service, tx, tasks, events } = setup({
      item: {
        id: 'item',
        title: 'Write docs',
        assigneeId: 'amy',
        dueDate: due,
        taskId: null,
      },
    });

    const result = await service.convertActionItem(
      'organizer',
      'meeting',
      'item',
    );

    expect(tasks.create).toHaveBeenCalledWith(
      'organizer',
      'project',
      {
        title: 'Write docs',
        description: 'From the meeting "Sprint planning".',
        assigneeId: 'amy',
        dueDate: due.toISOString(),
      },
      expect.any(Function),
    );
    expect(tx.meetingActionItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'item', taskId: null },
      data: { taskId: 'task' },
    });
    expect(events.activity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'meeting.action_converted',
        taskId: 'task',
        meetingId: 'meeting',
      }),
      tx,
    );
    expect(result.task).toEqual({ id: 'task' });
  });

  it('will not create a second task from the same action item', async () => {
    const done = setup({
      item: {
        id: 'item',
        title: 'Write docs',
        assigneeId: null,
        dueDate: null,
        taskId: 'old-task',
      },
    });
    await expect(
      done.service.convertActionItem('organizer', 'meeting', 'item'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(done.tasks.create).not.toHaveBeenCalled();

    const raced = setup({ claimed: 0 });
    await expect(
      raced.service.convertActionItem('organizer', 'meeting', 'item'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
