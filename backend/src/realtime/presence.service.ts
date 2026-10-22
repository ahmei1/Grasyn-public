import { Injectable } from '@nestjs/common';

type Connection = {
  userId: string;
  name: string;
  workspaceId: string;
  projectId: string | null;
  taskId: string | null;
  since: number;
};

export type PresenceMember = {
  userId: string;
  name: string;
  projectIds: string[];
  taskIds: string[];
  since: string;
};

/**
 * Who is connected right now, per socket. A person with several tabs open is
 * one member whose scopes are merged. This is in memory, so it covers one API
 * process; several servers would need a shared store such as Redis.
 */
@Injectable()
export class PresenceService {
  private readonly connections = new Map<string, Connection>();

  /** Records where a socket is. Returns every workspace whose list changed. */
  set(socketId: string, entry: Omit<Connection, 'since'>): string[] {
    const previous = this.connections.get(socketId);
    this.connections.set(socketId, {
      ...entry,
      since:
        previous && previous.workspaceId === entry.workspaceId
          ? previous.since
          : Date.now(),
    });
    if (previous && previous.workspaceId !== entry.workspaceId) {
      return [previous.workspaceId, entry.workspaceId];
    }
    return [entry.workspaceId];
  }

  /** Forgets a socket. Returns the workspace it was in, if any. */
  remove(socketId: string): string | null {
    const previous = this.connections.get(socketId);
    this.connections.delete(socketId);
    return previous?.workspaceId ?? null;
  }

  members(workspaceId: string): PresenceMember[] {
    const byUser = new Map<string, PresenceMember>();
    for (const connection of this.connections.values()) {
      if (connection.workspaceId !== workspaceId) continue;
      const since = new Date(connection.since).toISOString();
      const member = byUser.get(connection.userId) ?? {
        userId: connection.userId,
        name: connection.name,
        projectIds: [],
        taskIds: [],
        since,
      };
      if (since < member.since) member.since = since;
      if (
        connection.projectId &&
        !member.projectIds.includes(connection.projectId)
      ) {
        member.projectIds.push(connection.projectId);
      }
      if (connection.taskId && !member.taskIds.includes(connection.taskId)) {
        member.taskIds.push(connection.taskId);
      }
      byUser.set(connection.userId, member);
    }
    return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}
