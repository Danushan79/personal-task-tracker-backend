import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import { toJsonPlugin } from '@/models/plugins/to-json';

export interface RefreshTokenAttrs {
  userId: Types.ObjectId;
  /** SHA-256 hash of the token's `jti` claim — the raw jti is never stored. */
  jtiHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export type RefreshTokenDocument = HydratedDocument<RefreshTokenAttrs>;
export type RefreshTokenModel = Model<RefreshTokenAttrs>;

const refreshTokenSchema = new Schema<RefreshTokenAttrs, RefreshTokenModel>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jtiHash: { type: String, required: true, unique: true },
    familyId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// TTL index: Mongo removes the document once expiresAt has passed.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

toJsonPlugin(refreshTokenSchema);

export const RefreshToken = model<RefreshTokenAttrs, RefreshTokenModel>(
  'RefreshToken',
  refreshTokenSchema,
);
