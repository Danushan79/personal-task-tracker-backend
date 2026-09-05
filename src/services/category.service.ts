import { Types } from 'mongoose';

import type { CategoryColor, CategoryIcon } from '@/constants/taxonomy';
import { Category, type CategoryDocument } from '@/models/category.model';
import { Task } from '@/models/task.model';
import { ApiError } from '@/utils/api-error';
import { isDuplicateKeyError } from '@/utils/mongo-errors';
import type {
  CreateCategoryInput,
  ListCategoriesQuery,
  UpdateCategoryInput,
} from '@/validators/category.validator';

interface CategoryResponse {
  id: string;
  name: string;
  icon: CategoryIcon;
  color: CategoryColor;
  taskCount: number;
  createdAt: Date;
}

interface CategoryListResult {
  items: CategoryResponse[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

const DUPLICATE_NAME_MESSAGE = 'A category with that name already exists';

/**
 * `taskCount` is never stored (D-005) — one grouped aggregation over the user's tasks,
 * per `DATA_MODEL.md` §categories.
 */
async function taskCountsByCategory(
  userId: string,
  includeCompleted: boolean,
): Promise<Map<string, number>> {
  const match: Record<string, unknown> = {
    userId: new Types.ObjectId(userId),
    categoryId: { $ne: null },
  };
  if (!includeCompleted) match.status = 'pending';

  const grouped = await Task.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: match },
    { $group: { _id: '$categoryId', count: { $sum: 1 } } },
  ]);

  return new Map(grouped.map((g) => [String(g._id), g.count]));
}

function toResponse(category: CategoryDocument, taskCount: number): CategoryResponse {
  return {
    id: category.id,
    name: category.name,
    icon: category.icon,
    color: category.color,
    taskCount,
    createdAt: category.get('createdAt') as Date,
  };
}

export async function list(
  userId: string,
  query: ListCategoriesQuery,
): Promise<CategoryListResult> {
  const { page, limit, includeCompleted } = query;

  const [categories, total, counts] = await Promise.all([
    Category.find({ userId })
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Category.countDocuments({ userId }),
    taskCountsByCategory(userId, includeCompleted),
  ]);

  const items = categories.map((category) =>
    toResponse(category, counts.get(String(category._id)) ?? 0),
  );

  return { items, page, limit, total, hasMore: page * limit < total };
}

export async function getById(userId: string, id: string): Promise<CategoryResponse> {
  const category = await Category.findOne({ _id: id, userId });
  if (!category) throw ApiError.notFound('Category not found');

  const counts = await taskCountsByCategory(userId, false);
  return toResponse(category, counts.get(String(category._id)) ?? 0);
}

export async function create(
  userId: string,
  input: CreateCategoryInput,
): Promise<CategoryResponse> {
  let category: CategoryDocument;
  try {
    category = await Category.create({ userId, ...input });
  } catch (error) {
    if (isDuplicateKeyError(error)) throw ApiError.conflict(DUPLICATE_NAME_MESSAGE);
    throw error;
  }
  return toResponse(category, 0);
}

export async function update(
  userId: string,
  id: string,
  input: UpdateCategoryInput,
): Promise<CategoryResponse> {
  let category: CategoryDocument | null;
  try {
    category = await Category.findOneAndUpdate({ _id: id, userId }, input, {
      returnDocument: 'after',
      runValidators: true,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) throw ApiError.conflict(DUPLICATE_NAME_MESSAGE);
    throw error;
  }
  if (!category) throw ApiError.notFound('Category not found');

  const counts = await taskCountsByCategory(userId, false);
  return toResponse(category, counts.get(String(category._id)) ?? 0);
}

/**
 * `DATA_MODEL.md` Cascade behaviour: reassign (or null out) referencing tasks, then
 * delete. No transaction (D-009) — this ordering means the worst interleaving on failure
 * leaves tasks correctly reassigned with a stale category row present, never tasks
 * pointing at a category that no longer exists.
 */
export async function remove(userId: string, id: string, reassignTo?: string): Promise<void> {
  const category = await Category.findOne({ _id: id, userId });
  if (!category) throw ApiError.notFound('Category not found');

  if (reassignTo) {
    if (reassignTo === id) {
      throw new ApiError(422, 'reassignTo cannot be the category being deleted');
    }

    const target = await Category.findOne({ _id: reassignTo, userId });
    if (!target) {
      throw new ApiError(422, 'reassignTo must reference an existing category you own');
    }

    await Task.updateMany({ userId, categoryId: category._id }, { categoryId: target._id });
  } else {
    await Task.updateMany({ userId, categoryId: category._id }, { categoryId: null });
  }

  await Category.deleteOne({ _id: id, userId });
}
