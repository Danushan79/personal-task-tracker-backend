import type { CategoryColor, CategoryIcon } from '@/constants/taxonomy';
import { User, type UserDocument } from '@/models/user.model';
import * as tokenService from '@/services/token.service';
import { ApiError } from '@/utils/api-error';
import { logger } from '@/utils/logger';
import { isDuplicateKeyError } from '@/utils/mongo-errors';
import type {
  ForgotPasswordInput,
  LoginInput,
  LogoutInput,
  RefreshInput,
  RegisterInput,
  UpdateMeInput,
} from '@/validators/auth.validator';

const INVALID_CREDENTIALS = 'Invalid email or password';

/** Used by the `npm run seed` dev fixture (`src/scripts/seed.ts`) — not seeded on register. */
export const DEFAULT_CATEGORIES: ReadonlyArray<{
  name: string;
  icon: CategoryIcon;
  color: CategoryColor;
}> = [
  { name: 'Work', icon: 'work', color: '#0058bd' },
  { name: 'Personal', icon: 'home', color: '#8e24aa' },
  { name: 'Health', icon: 'favorite', color: '#ba1a1a' },
  { name: 'Errands', icon: 'shopping_cart', color: '#e64a19' },
];

interface PublicUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: Date;
}

interface MeUser extends PublicUser {
  timezone: string;
}

function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    createdAt: user.get('createdAt') as Date,
  };
}

function toMeUser(user: UserDocument): MeUser {
  return { ...toPublicUser(user), timezone: user.timezone };
}

interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

async function issueSession(user: UserDocument): Promise<AuthResult> {
  const accessToken = tokenService.signAccess(user.id);
  const { token: refreshToken } = await tokenService.signRefresh(user.id);
  return { user: toPublicUser(user), accessToken, refreshToken };
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  let user: UserDocument;
  try {
    user = await User.create({
      name: input.name,
      email: input.email,
      passwordHash: input.password,
      acceptedTermsAt: new Date(),
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) throw ApiError.conflict('Email already registered');
    throw error;
  }

  return issueSession(user);
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  if (!user) throw ApiError.unauthorized(INVALID_CREDENTIALS);

  const valid = await user.comparePassword(input.password);
  if (!valid) throw ApiError.unauthorized(INVALID_CREDENTIALS);

  return issueSession(user);
}

export async function refresh(
  input: RefreshInput,
): Promise<{ accessToken: string; refreshToken: string }> {
  const { accessToken, refreshToken } = await tokenService.rotate(input.refreshToken);
  return { accessToken, refreshToken };
}

export async function logout(input: LogoutInput): Promise<void> {
  await tokenService.revoke(input.refreshToken);
}

export async function getMe(userId: string): Promise<MeUser> {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  return toMeUser(user);
}

export async function updateMe(userId: string, input: UpdateMeInput): Promise<MeUser> {
  const user = await User.findByIdAndUpdate(userId, input, {
    returnDocument: 'after',
    runValidators: true,
  });
  if (!user) throw ApiError.notFound('User not found');
  return toMeUser(user);
}

/**
 * v1 stub (FR-1.5): validates and logs, always responds the same way regardless of
 * whether the account exists, and sends nothing. See `OPEN_QUESTIONS.md` Q4.
 */
export function forgotPassword(input: ForgotPasswordInput): { message: string } {
  logger.info(`Password reset requested for ${input.email}`);
  return { message: 'If that email is registered, a reset link has been sent.' };
}
