import 'dotenv/config';
import { z } from 'zod';

/**
 * Every environment variable the app reads goes through this schema, so a
 * missing or malformed value fails loudly at boot instead of at request time.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    CORS_ORIGIN: z.string().default('*'),
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('30d'),
    BCRYPT_ROUNDS: z.coerce.number().int().positive().default(12),
    OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
    OPENAI_TRANSCRIBE_MODEL: z.string().default('whisper-1'),
    OPENAI_PARSE_MODEL: z.string().default('gpt-4o-mini'),
  })
  .refine((data) => data.JWT_ACCESS_SECRET !== data.JWT_REFRESH_SECRET, {
    message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ',
    path: ['JWT_REFRESH_SECRET'],
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** CORS_ORIGIN accepts a single origin, a comma-separated list, or `*`. */
export const corsOrigins =
  env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
