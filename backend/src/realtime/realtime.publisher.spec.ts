import { RealtimePublisher } from './realtime.publisher';

const message = {
  room: 'workspace:w',
  event: 'activity' as const,
  data: {
    type: 'task.updated',
    workspaceId: 'w',
    projectId: 'p',
    taskId: 't',
  },
};

describe('RealtimePublisher', () => {
  it('sends queued messages only after the work succeeds', async () => {
    const publisher = new RealtimePublisher();
    const sent: unknown[] = [];
    publisher.bind((messages) => sent.push(...messages));

    const result = await publisher.run(() => {
      publisher.enqueue(message);
      publisher.enqueue(message);
      return Promise.resolve('saved');
    });

    expect(result).toBe('saved');
    expect(sent).toEqual([message]);
  });

  it('drops queued messages when the work fails', async () => {
    const publisher = new RealtimePublisher();
    const sent: unknown[] = [];
    publisher.bind((messages) => sent.push(...messages));

    await expect(
      publisher.run(() => {
        publisher.enqueue(message);
        return Promise.reject(new Error('rolled back'));
      }),
    ).rejects.toThrow('rolled back');
    expect(sent).toEqual([]);
  });

  it('sends immediately when nothing is wrapping the call', () => {
    const publisher = new RealtimePublisher();
    const sent: unknown[] = [];
    publisher.bind((messages) => sent.push(...messages));

    publisher.enqueue(message);

    expect(sent).toEqual([message]);
  });
});
