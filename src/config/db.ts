import mongoose from 'mongoose';

import { env, isProduction } from '@/config/env';
import { logger } from '@/utils/logger';

mongoose.set('strictQuery', true);
// Surface slow/incorrect queries during development.
mongoose.set('debug', !isProduction && env.LOG_LEVEL === 'debug');

export async function connectDatabase(): Promise<void> {
  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('error', (error) => logger.error('MongoDB error', error));

  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10_000,
  });
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed');
}
