import type { CreateCategoryInput } from '@/validators/category.validator';

export function makeCategory(overrides: Partial<CreateCategoryInput> = {}): CreateCategoryInput {
  return {
    name: 'Study',
    icon: 'school',
    color: '#00acc1',
    ...overrides,
  };
}
