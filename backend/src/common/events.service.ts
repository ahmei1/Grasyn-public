import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  RealtimeMessage,
  RealtimePublisher,
} from '../realtime/realtime.publisher';

type ActivityInput = {
  workspaceId: string;
  /** Left out for events from outside Grasyn, such as GitHub. */
  actorId?: string;
  type: string;
  projectId?: string;
  taskId?: string;
  /** Stored in metadata, since activity rows have no meeting column. */
  meetingId?: string;
  metadata?: Prisma.InputJsonObject;
};

type NotifyInput = {
  workspaceId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  resourceType?: string;
  resourceId?: string;
};

type AuditInput = {
  workspaceId: string;
  actorId: string;
  action: string;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimePublisher,
  ) {}

  /** Runs work, then sends queued realtime messages only if it succeeds. */
  run<T>(work: () => Promise<T>) {
    return this.realtime.run(work);
  }

  publish(message: RealtimeMessage) {
    this.realtime.enqueue(message);
  }

  async activity(
    input: ActivityInput,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const created = await db.activityEvent.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        type: input.type,
        projectId: input.projectId,
        taskId: input.taskId,
        metadata: {
          ...input.metadata,
          ...(input.meetingId ? { meetingId: input.meetingId } : {}),
        },
      },
    });
    this.publish({
      room: `workspace:${input.workspaceId}`,
      event: 'activity',
      data: {
        type: input.type,
        workspaceId: input.workspaceId,
        projectId: input.projectId ?? null,
        taskId: input.taskId ?? null,
        meetingId: input.meetingId ?? null,
      },
    });
    return created;
  }

  async notify(input: NotifyInput, db: Prisma.TransactionClient = this.prisma) {
    if (!input.userId) return null;
    const created = await db.notification.create({
      data: input,
    });
    this.publish({
      room: `user:${input.userId}`,
      event: 'notification',
      data: { workspaceId: input.workspaceId },
    });
    return created;
  }

  audit(input: AuditInput, db: Prisma.TransactionClient = this.prisma) {
    return db.auditEvent.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: input.action,
        metadata: input.metadata ?? {},
      },
    });
  }
}
