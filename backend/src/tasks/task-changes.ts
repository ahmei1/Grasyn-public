import { TaskPriority, TaskStatus } from '@prisma/client';

export type TaskField =
  'title' | 'description' | 'status' | 'priority' | 'assignee' | 'dueDate';

export interface TaskSnapshot {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  dueDate: Date | null;
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'In review',
  DONE: 'Done',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

// Due dates are stored as UTC midnight, so they must be formatted in UTC.
const dueDateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatDueDate(value: Date | null) {
  return value ? dueDateFormat.format(value) : null;
}

export function dateKey(value: Date | null) {
  return value ? value.toISOString() : null;
}

export function changedTaskFields(
  previous: TaskSnapshot,
  next: TaskSnapshot,
): TaskField[] {
  const changes: TaskField[] = [];
  if (previous.title !== next.title) changes.push('title');
  if (previous.description !== next.description) changes.push('description');
  if (previous.status !== next.status) changes.push('status');
  if (previous.priority !== next.priority) changes.push('priority');
  if (previous.assigneeId !== next.assigneeId) changes.push('assignee');
  if (dateKey(previous.dueDate) !== dateKey(next.dueDate)) {
    changes.push('dueDate');
  }
  return changes;
}

export function describeTaskChanges(
  changes: TaskField[],
  previous: TaskSnapshot,
  next: TaskSnapshot,
  assigneeName: string | null,
) {
  return changes.map((field) => {
    switch (field) {
      case 'title':
        return `renamed it to "${next.title}"`;
      case 'description':
        return 'updated the description';
      case 'status':
        return `changed the status from ${TASK_STATUS_LABELS[previous.status]} to ${TASK_STATUS_LABELS[next.status]}`;
      case 'priority':
        return `changed the priority from ${TASK_PRIORITY_LABELS[previous.priority]} to ${TASK_PRIORITY_LABELS[next.priority]}`;
      case 'assignee':
        return next.assigneeId
          ? `assigned it to ${assigneeName ?? 'a teammate'}`
          : 'removed the assignee';
      case 'dueDate':
        if (!next.dueDate) return 'removed the due date';
        return previous.dueDate
          ? `changed the due date from ${formatDueDate(previous.dueDate)} to ${formatDueDate(next.dueDate)}`
          : `set the due date to ${formatDueDate(next.dueDate)}`;
    }
  });
}

export function taskChangeTitle(changes: TaskField[]) {
  if (changes.length !== 1) return 'Task updated';
  switch (changes[0]) {
    case 'dueDate':
      return 'Due date changed';
    case 'status':
      return 'Status changed';
    case 'priority':
      return 'Priority changed';
    case 'assignee':
      return 'Task reassigned';
    case 'title':
      return 'Task renamed';
    case 'description':
      return 'Description updated';
  }
}

export function joinPhrases(phrases: string[]) {
  if (phrases.length <= 1) return phrases.join('');
  return `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`;
}
