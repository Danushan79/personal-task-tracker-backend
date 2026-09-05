import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import { toJsonPlugin } from '@/models/plugins/to-json';

export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskRecurrence = 'none' | 'daily' | 'weekly' | 'monthly';
export type TaskStatus = 'pending' | 'completed';

export interface TaskAttrs {
  userId: Types.ObjectId;
  title: string;
  description: string | null;
  categoryId: Types.ObjectId | null;
  dueAt: Date | null;
  hasTime: boolean;
  originalDueAt: Date | null;
  priority: TaskPriority;
  recurrence: TaskRecurrence;
  status: TaskStatus;
  completedAt: Date | null;
  rescheduleCount: number;
  recurrenceParentId: Types.ObjectId | null;
}

export type TaskDocument = HydratedDocument<TaskAttrs>;
export type TaskModel = Model<TaskAttrs>;

const taskSchema = new Schema<TaskAttrs, TaskModel>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
    description: { type: String, default: null, maxlength: 2000 },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    dueAt: { type: Date, default: null },
    hasTime: { type: Boolean, default: false },
    originalDueAt: { type: Date, default: null },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    recurrence: { type: String, enum: ['none', 'daily', 'weekly', 'monthly'], default: 'none' },
    status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
    completedAt: { type: Date, default: null },
    rescheduleCount: { type: Number, default: 0 },
    recurrenceParentId: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
  },
  { timestamps: true },
);

// Every index leads with userId (every query filters on it first — DATA_MODEL.md Indexes).
taskSchema.index({ userId: 1, status: 1, dueAt: 1 }); // buckets: today/upcoming/overdue, and sort
taskSchema.index({ userId: 1, status: 1, completedAt: -1 }); // the completed bucket
taskSchema.index({ userId: 1, categoryId: 1, status: 1 }); // FR-2.6 filter, and taskCount

toJsonPlugin(taskSchema);

export const Task = model<TaskAttrs, TaskModel>('Task', taskSchema);
