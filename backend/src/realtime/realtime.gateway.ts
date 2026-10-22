import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AccessService } from '../common/access.service';
import { ACCESS_COOKIE } from '../common/cookies';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from './presence.service';
import { RealtimePublisher } from './realtime.publisher';

const CUID = /^c[a-z0-9]{24}$/;

type SessionUser = { id: string; name: string; email: string };

type JoinBody = {
  workspaceId?: unknown;
  projectId?: unknown;
  taskId?: unknown;
};

function cookieValue(
  header: string | string[] | undefined,
  name: string,
): string | undefined {
  const raw = Array.isArray(header) ? header.join('; ') : header;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return undefined;
}

function cuidOrEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && CUID.test(value) ? value : undefined;
}

@WebSocketGateway()
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private server: Server | null = null;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly publisher: RealtimePublisher,
    private readonly presence: PresenceService,
  ) {}

  afterInit(server: Server) {
    this.server = server;
    this.publisher.bind((messages) => {
      for (const message of messages) {
        server.to(message.room).emit(message.event, message.data);
      }
    });
  }

  async handleConnection(client: Socket) {
    try {
      const token = cookieValue(client.handshake.headers.cookie, ACCESS_COOKIE);
      if (!token) throw new Error('Missing session');
      const payload = await this.jwt.verifyAsync<{ sub?: unknown }>(token);
      if (typeof payload.sub !== 'string' || !payload.sub) {
        throw new Error('Invalid subject');
      }
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, name: true, email: true },
      });
      if (!user) throw new Error('Unknown user');
      (client.data as { user?: SessionUser }).user = user;
      await client.join(`user:${user.id}`);
    } catch (error) {
      this.logger.debug(
        `Rejected realtime connection: ${error instanceof Error ? error.message : 'unauthorized'}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const workspaceId = this.presence.remove(client.id);
    if (workspaceId) this.broadcastPresence(workspaceId);
  }

  private broadcastPresence(workspaceId: string) {
    this.server?.to(`workspace:${workspaceId}`).emit('presence', {
      workspaceId,
      members: this.presence.members(workspaceId),
    });
  }

  /**
   * Joins the rooms for the screen the member is looking at.
   * Workspace, project, and task checks are the same ones the REST API uses.
   */
  @SubscribeMessage('join')
  async join(client: Socket, body: JoinBody) {
    const user = (client.data as { user?: SessionUser }).user;
    if (!user) return { ok: false };

    const workspaceId = cuidOrEmpty(body?.workspaceId);
    if (!workspaceId) return { ok: false };
    const projectRequested = body?.projectId != null && body.projectId !== '';
    const taskRequested = body?.taskId != null && body.taskId !== '';
    const projectId = cuidOrEmpty(body?.projectId);
    const taskId = cuidOrEmpty(body?.taskId);
    if ((projectRequested && !projectId) || (taskRequested && !taskId)) {
      return { ok: false };
    }

    try {
      await this.access.requireMembership(user.id, workspaceId);
      let joinedProjectId = projectId;
      if (projectId) {
        const project = await this.access.requireProject(user.id, projectId);
        if (project.workspaceId !== workspaceId) return { ok: false };
      }
      if (taskId) {
        const task = await this.access.requireTask(user.id, taskId);
        if (task.workspaceId !== workspaceId) return { ok: false };
        if (projectId && task.projectId !== projectId) return { ok: false };
        joinedProjectId = task.projectId;
      }

      const next = [
        `workspace:${workspaceId}`,
        joinedProjectId ? `project:${joinedProjectId}` : null,
        taskId ? `task:${taskId}` : null,
      ].filter((room): room is string => Boolean(room));
      const previous =
        (client.data as { scopeRooms?: string[] }).scopeRooms ?? [];
      for (const room of previous) {
        if (!next.includes(room)) await client.leave(room);
      }
      for (const room of next) {
        if (!previous.includes(room)) await client.join(room);
      }
      (client.data as { scopeRooms?: string[] }).scopeRooms = next;
      const changed = this.presence.set(client.id, {
        userId: user.id,
        name: user.name,
        workspaceId,
        projectId: joinedProjectId ?? null,
        taskId: taskId ?? null,
      });
      for (const id of changed) this.broadcastPresence(id);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }
}
