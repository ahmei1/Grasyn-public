import { ForbiddenException } from '@nestjs/common';
import type { Socket } from 'socket.io';
import { ACCESS_COOKIE } from '../common/cookies';
import { PresenceService } from './presence.service';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimePublisher } from './realtime.publisher';

const workspaceId = `c${'a'.repeat(24)}`;
const projectId = `c${'b'.repeat(24)}`;
const taskId = `c${'d'.repeat(24)}`;

function fakeClient(cookie?: string, id = 'socket-1') {
  const rooms = new Set<string>();
  return {
    id,
    handshake: { headers: { cookie } },
    data: {} as {
      user?: { id: string; name: string; email: string };
      scopeRooms?: string[];
    },
    rooms,
    join: jest.fn((room: string) => {
      rooms.add(room);
    }),
    leave: jest.fn((room: string) => {
      rooms.delete(room);
    }),
    disconnect: jest.fn(),
  };
}

describe('RealtimeGateway', () => {
  const jwt = { verifyAsync: jest.fn() };
  const prisma = { user: { findUnique: jest.fn() } };
  const access = {
    requireMembership: jest.fn(),
    requireProject: jest.fn(),
    requireTask: jest.fn(),
  };
  const publisher = new RealtimePublisher();
  const presence = new PresenceService();
  const gateway = new RealtimeGateway(
    jwt as never,
    prisma as never,
    access as never,
    publisher,
    presence,
  );

  function fakeServer() {
    const emitted: { room: string; event: string; data: unknown }[] = [];
    const server = {
      to: (room: string) => ({
        emit: (event: string, data: unknown) =>
          emitted.push({ room, event, data }),
      }),
    };
    gateway.afterInit(server as never);
    return emitted;
  }

  it('tells the workspace who is here when a member opens a task, and when they leave', async () => {
    const emitted = fakeServer();
    access.requireMembership.mockResolvedValue({ role: 'MEMBER' });
    access.requireTask.mockResolvedValue({
      id: taskId,
      workspaceId,
      projectId,
    });
    const client = fakeClient(undefined, 'presence-socket');
    client.data.user = { id: 'user-1', name: 'Ada', email: 'ada@example.com' };

    await gateway.join(client as never, { workspaceId, taskId });

    expect(emitted.at(-1)).toEqual({
      room: `workspace:${workspaceId}`,
      event: 'presence',
      data: {
        workspaceId,
        members: [
          expect.objectContaining({
            userId: 'user-1',
            name: 'Ada',
            projectIds: [projectId],
            taskIds: [taskId],
          }),
        ],
      },
    });

    gateway.handleDisconnect(client as never);

    expect(emitted.at(-1)).toEqual({
      room: `workspace:${workspaceId}`,
      event: 'presence',
      data: { workspaceId, members: [] },
    });
  });

  it('does not announce a member whose join was refused', async () => {
    const emitted = fakeServer();
    access.requireMembership.mockRejectedValue(new ForbiddenException());
    const client = fakeClient(undefined, 'refused-socket');
    client.data.user = { id: 'user-2', name: 'Bo', email: 'bo@example.com' };

    await gateway.join(client as never, { workspaceId });

    expect(emitted).toEqual([]);
    expect(presence.members(workspaceId)).toEqual([]);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a connection without a valid session cookie', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('expired'));
    const client = fakeClient(`${ACCESS_COOKIE}=stale`);

    await gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.rooms.size).toBe(0);
  });

  it('puts an authenticated user in their private room', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1' });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Ada',
      email: 'ada@example.com',
    });
    const client = fakeClient(`${ACCESS_COOKIE}=token`);

    await gateway.handleConnection(client as never);

    expect(client.disconnect).not.toHaveBeenCalled();
    expect(client.rooms.has('user:user-1')).toBe(true);
    expect(client.data.user?.id).toBe('user-1');
  });

  it('refuses a workspace the user does not belong to', async () => {
    access.requireMembership.mockRejectedValue(new ForbiddenException());
    const client = fakeClient();
    client.data.user = { id: 'user-1', name: 'Ada', email: 'ada@example.com' };

    await expect(
      gateway.join(client as never, { workspaceId }),
    ).resolves.toEqual({
      ok: false,
    });
    expect(client.rooms.has(`workspace:${workspaceId}`)).toBe(false);
  });

  it('joins the workspace, project, and task after the same access checks as the API', async () => {
    access.requireMembership.mockResolvedValue({ role: 'MEMBER' });
    access.requireProject.mockResolvedValue({
      id: projectId,
      workspaceId,
    });
    access.requireTask.mockResolvedValue({
      id: taskId,
      workspaceId,
      projectId,
    });
    const client = fakeClient();
    client.data.user = { id: 'user-1', name: 'Ada', email: 'ada@example.com' };

    await expect(
      gateway.join(client as never, { workspaceId, projectId, taskId }),
    ).resolves.toEqual({ ok: true });
    expect(client.rooms.has(`workspace:${workspaceId}`)).toBe(true);
    expect(client.rooms.has(`project:${projectId}`)).toBe(true);
    expect(client.rooms.has(`task:${taskId}`)).toBe(true);
  });

  it('leaves the previous project room when the member opens another one', async () => {
    access.requireMembership.mockResolvedValue({ role: 'MEMBER' });
    access.requireProject.mockResolvedValue({ id: projectId, workspaceId });
    const client = fakeClient();
    client.data.user = { id: 'user-1', name: 'Ada', email: 'ada@example.com' };
    client.data.scopeRooms = [
      `workspace:${workspaceId}`,
      `project:c${'e'.repeat(24)}`,
    ];
    client.rooms.add(`project:c${'e'.repeat(24)}`);

    await gateway.join(client as unknown as Socket, { workspaceId, projectId });

    expect(client.rooms.has(`project:c${'e'.repeat(24)}`)).toBe(false);
    expect(client.rooms.has(`project:${projectId}`)).toBe(true);
  });

  it('delivers a committed message to the room', () => {
    const emitted: unknown[][] = [];
    const server = {
      to: jest.fn(() => ({
        emit: (...args: unknown[]) => emitted.push(args),
      })),
    };
    gateway.afterInit(server as never);

    publisher.enqueue({
      room: `workspace:${workspaceId}`,
      event: 'activity',
      data: {
        type: 'task.updated',
        workspaceId,
        projectId,
        taskId,
      },
    });

    expect(server.to).toHaveBeenCalledWith(`workspace:${workspaceId}`);
    expect(emitted).toEqual([
      [
        'activity',
        {
          type: 'task.updated',
          workspaceId,
          projectId,
          taskId,
        },
      ],
    ]);
  });
});
