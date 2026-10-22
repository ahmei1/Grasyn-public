import {
  changedTaskFields,
  describeTaskChanges,
  joinPhrases,
  taskChangeTitle,
  type TaskSnapshot,
} from './task-changes';

const base: TaskSnapshot = {
  title: 'Design login',
  description: '',
  status: 'IN_PROGRESS',
  priority: 'MEDIUM',
  assigneeId: 'user-1',
  dueDate: new Date('2026-10-10T00:00:00.000Z'),
};

describe('task change descriptions', () => {
  it('reports only the due date when only the due date changed', () => {
    const next = { ...base, dueDate: new Date('2026-10-12T00:00:00.000Z') };
    const changes = changedTaskFields(base, next);
    expect(changes).toEqual(['dueDate']);
    expect(taskChangeTitle(changes)).toBe('Due date changed');
    expect(describeTaskChanges(changes, base, next, null)).toEqual([
      'changed the due date from 10 Oct 2026 to 12 Oct 2026',
    ]);
  });

  it('describes several changes in one readable sentence', () => {
    const next = {
      ...base,
      status: 'DONE' as const,
      priority: 'URGENT' as const,
      assigneeId: 'user-2',
    };
    const changes = changedTaskFields(base, next);
    expect(taskChangeTitle(changes)).toBe('Task updated');
    expect(
      joinPhrases(describeTaskChanges(changes, base, next, 'Sara Ali')),
    ).toBe(
      'changed the status from In progress to Done, changed the priority from Medium to Urgent and assigned it to Sara Ali',
    );
  });

  it('describes removing a due date and an assignee', () => {
    const next = { ...base, dueDate: null, assigneeId: null };
    const changes = changedTaskFields(base, next);
    expect(describeTaskChanges(changes, base, next, null)).toEqual([
      'removed the assignee',
      'removed the due date',
    ]);
  });

  it('finds no changes when nothing changed', () => {
    expect(changedTaskFields(base, { ...base })).toEqual([]);
  });
});
