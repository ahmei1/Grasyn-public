/** Two to five characters, starting with a letter: GS, WEB, APP2. */
export const TASK_PREFIX_PATTERN = /^[A-Z][A-Z0-9]{1,4}$/;

/** First letters of the workspace name, or GS when there are too few. */
export function defaultTaskPrefix(name: string) {
  const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase();
  return letters.length >= 2 ? letters.slice(0, 3) : 'GS';
}

export function taskKey(prefix: string, number: number) {
  return `${prefix}-${number}`;
}

/**
 * Task numbers mentioned in free text for one workspace prefix, in order and
 * without repeats. Matches "GS-42", "gs-42", and "feature/GS-42-login", but
 * not "XGS-42" or "GS-42a".
 */
export function findTaskNumbers(text: string, prefix: string): number[] {
  const pattern = new RegExp(
    `(?<![A-Za-z0-9])${prefix}-(\\d{1,9})(?![A-Za-z0-9])`,
    'gi',
  );
  const numbers: number[] = [];
  for (const match of text.matchAll(pattern)) {
    const value = Number(match[1]);
    if (value > 0 && !numbers.includes(value)) numbers.push(value);
  }
  return numbers;
}
