import bcrypt from 'bcrypt';
import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

import { env } from '@/config/env';
import { toJsonPlugin } from '@/models/plugins/to-json';

export interface UserAttrs {
  name: string;
  email: string;
  passwordHash: string;
  avatarUrl: string | null;
  timezone: string;
  acceptedTermsAt: Date | null;
}

export interface UserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

export type UserDocument = HydratedDocument<UserAttrs, UserMethods>;
export type UserModel = Model<UserAttrs, object, UserMethods>;

const userSchema = new Schema<UserAttrs, UserModel, UserMethods>(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    avatarUrl: { type: String, default: null },
    timezone: { type: String, default: 'UTC' },
    acceptedTermsAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Only re-hash when the field itself changed — a profile update must not re-hash an
// already-hashed password. Mongoose 9's pre('save') hooks are promise-based, no `next`.
userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('passwordHash')) return;

  this.passwordHash = await bcrypt.hash(this.passwordHash, env.BCRYPT_ROUNDS);
});

userSchema.methods.comparePassword = function comparePassword(candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.passwordHash);
};

toJsonPlugin(userSchema, { private: ['passwordHash'] });

export const User = model<UserAttrs, UserModel>('User', userSchema);
