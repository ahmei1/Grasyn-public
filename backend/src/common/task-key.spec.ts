import {
  TASK_PREFIX_PATTERN,
  defaultTaskPrefix,
  findTaskNumbers,
  taskKey,
} from './task-key';

describe('task keys', () => {
  it('builds a prefix from the workspace name', () => {
    expect(defaultTaskPrefix('Lumen Studio')).toBe('LUM');
    expect(defaultTaskPrefix('UX')).toBe('UX');
    expect(defaultTaskPrefix('42')).toBe('GS');
    expect(defaultTaskPrefix('Ü')).toBe('GS');
  });

  it('accepts only short uppercase prefixes that start with a letter', () => {
    expect(TASK_PREFIX_PATTERN.test('GS')).toBe(true);
    expect(TASK_PREFIX_PATTERN.test('APP2')).toBe(true);
    expect(TASK_PREFIX_PATTERN.test('G')).toBe(false);
    expect(TASK_PREFIX_PATTERN.test('2GS')).toBe(false);
    expect(TASK_PREFIX_PATTERN.test('gs')).toBe(false);
    expect(TASK_PREFIX_PATTERN.test('TOOLONG')).toBe(false);
  });

  it('formats a key', () => {
    expect(taskKey('GS', 42)).toBe('GS-42');
  });

  it('finds keys in branch names, titles, and commit messages', () => {
    expect(findTaskNumbers('feature/GS-42-login', 'GS')).toEqual([42]);
    expect(findTaskNumbers('Fix gs-7 and GS-12; refs GS-7', 'GS')).toEqual([
      7, 12,
    ]);
    expect(findTaskNumbers('(GS-3)', 'GS')).toEqual([3]);
  });

  it('ignores lookalikes and other prefixes', () => {
    expect(findTaskNumbers('XGS-42 GS-42a WEB-9 GS-0', 'GS')).toEqual([]);
    expect(findTaskNumbers('GS-', 'GS')).toEqual([]);
  });
});
