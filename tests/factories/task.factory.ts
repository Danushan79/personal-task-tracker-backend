import type { CreateTaskInput } from '@/validators/task.validator';

export function makeTask(overrides: Partial<CreateTaskInput> = {}): CreateTaskInput {
  return {
    title: 'A task',
    priority: 'medium',
    recurrence: 'none',
    ...overrides,
  };
}
