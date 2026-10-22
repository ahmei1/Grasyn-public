import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

export type RealtimeEventName = 'activity' | 'notification' | 'message';

export type RealtimeMessage = {
  room: string;
  event: RealtimeEventName;
  data: {
    type?: string;
    workspaceId: string;
    projectId?: string | null;
    taskId?: string | null;
    meetingId?: string | null;
  };
};

type Deliver = (messages: RealtimeMessage[]) => void;

/**
 * Queues socket messages until the surrounding database transaction commits.
 * A failed transaction drops the queue, so clients never refetch data that
 * was rolled back.
 */
@Injectable()
export class RealtimePublisher {
  private readonly pending = new AsyncLocalStorage<RealtimeMessage[]>();
  private deliver: Deliver | null = null;

  bind(deliver: Deliver) {
    this.deliver = deliver;
  }

  enqueue(message: RealtimeMessage) {
    const bucket = this.pending.getStore();
    if (bucket) {
      bucket.push(message);
      return;
    }
    this.flush([message]);
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    const bucket: RealtimeMessage[] = [];
    const result = await this.pending.run(bucket, work);
    this.flush(bucket);
    return result;
  }

  private flush(messages: RealtimeMessage[]) {
    if (!this.deliver || messages.length === 0) return;
    const seen = new Set<string>();
    const unique = messages.filter((message) => {
      const key = `${message.room}\0${message.event}\0${JSON.stringify(message.data)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    this.deliver(unique);
  }
}
