import { PresenceService } from './presence.service';

const entry = {
  userId: 'u1',
  name: 'Ada',
  workspaceId: 'w1',
  projectId: null,
  taskId: null,
};

describe('PresenceService', () => {
  it('merges several tabs of the same person into one member', () => {
    const presence = new PresenceService();
    presence.set('tab-1', { ...entry, projectId: 'p1' });
    presence.set('tab-2', { ...entry, projectId: 'p1', taskId: 't1' });

    expect(presence.members('w1')).toEqual([
      expect.objectContaining({
        userId: 'u1',
        projectIds: ['p1'],
        taskIds: ['t1'],
      }),
    ]);
  });

  it('keeps the person online until their last tab closes', () => {
    const presence = new PresenceService();
    presence.set('tab-1', entry);
    presence.set('tab-2', entry);

    expect(presence.remove('tab-1')).toBe('w1');
    expect(presence.members('w1')).toHaveLength(1);
    presence.remove('tab-2');
    expect(presence.members('w1')).toEqual([]);
  });

  it('reports both workspaces when a tab switches workspace', () => {
    const presence = new PresenceService();
    presence.set('tab-1', entry);

    expect(presence.set('tab-1', { ...entry, workspaceId: 'w2' })).toEqual([
      'w1',
      'w2',
    ]);
    expect(presence.members('w1')).toEqual([]);
    expect(presence.members('w2')).toHaveLength(1);
  });

  it('only lists members of the requested workspace', () => {
    const presence = new PresenceService();
    presence.set('a', entry);
    presence.set('b', {
      ...entry,
      userId: 'u2',
      name: 'Bo',
      workspaceId: 'w2',
    });

    expect(presence.members('w1').map((m) => m.userId)).toEqual(['u1']);
  });
});
