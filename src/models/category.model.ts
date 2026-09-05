import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  type CategoryColor,
  type CategoryIcon,
} from '@/constants/taxonomy';
import { toJsonPlugin } from '@/models/plugins/to-json';

export interface CategoryAttrs {
  userId: Types.ObjectId;
  name: string;
  icon: CategoryIcon;
  color: CategoryColor;
}

export type CategoryDocument = HydratedDocument<CategoryAttrs>;
export type CategoryModel = Model<CategoryAttrs>;

const categorySchema = new Schema<CategoryAttrs, CategoryModel>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 40 },
    icon: { type: String, required: true, enum: CATEGORY_ICONS },
    color: { type: String, required: true, enum: CATEGORY_COLORS },
  },
  { timestamps: true },
);

// Case-insensitive uniqueness per user (FR-2.9) — needs a collation on the index itself;
// queries against it must pass the same collation to use it.
categorySchema.index(
  { userId: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);
categorySchema.index({ userId: 1, createdAt: 1 });

toJsonPlugin(categorySchema);

export const Category = model<CategoryAttrs, CategoryModel>('Category', categorySchema);
