/**
 * The 10 category icons and 7 category colours, declared once (`DATA_MODEL.md`
 * Serialisation rule / `API_CONTRACT.md` §Categories). Both the `Category` model
 * and its validator import these instead of redeclaring the enum.
 */
export const CATEGORY_ICONS = [
  'work',
  'shopping_cart',
  'favorite',
  'book',
  'home',
  'flight',
  'fitness_center',
  'school',
  'restaurant',
  'pets',
] as const;

export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

export const CATEGORY_COLORS = [
  '#0058bd',
  '#ba1a1a',
  '#388e3c',
  '#fbc02d',
  '#8e24aa',
  '#00acc1',
  '#e64a19',
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number];
