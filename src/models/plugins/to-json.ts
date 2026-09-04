import type { Schema } from 'mongoose';

interface ToJsonOptions {
  /** Extra fields to strip beyond `_id` and `__v` (e.g. `passwordHash`). */
  private?: string[];
}

/**
 * Maps `_id` -> `id` and strips `_id`, `__v`, and any schema-specific secret
 * fields from every JSON response. Applied to every schema so a forgotten
 * per-schema transform can't leak a field like `passwordHash`
 * (`DATA_MODEL.md` Serialisation rule).
 */
export function toJsonPlugin(schema: Schema, options: ToJsonOptions = {}): void {
  const privateFields = options.private ?? [];

  schema.set('toJSON', {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      ret.id = String(ret._id);
      delete ret._id;
      delete ret.__v;
      for (const field of privateFields) {
        delete ret[field];
      }
      return ret;
    },
  });
}
