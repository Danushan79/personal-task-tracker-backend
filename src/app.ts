import express, { type Application, type Request } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { corsOrigins, isTest } from '@/config/env';
import { errorHandler } from '@/middleware/error-handler';
import { notFound } from '@/middleware/not-found';
import { requestId } from '@/middleware/request-id';
import { sanitizeKeys } from '@/middleware/sanitize-keys';
import { timezone } from '@/middleware/timezone';
import routes from '@/routes';

morgan.token('id', (req: Request) => req.id);

export function createApp(): Application {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestId);
  app.use(sanitizeKeys);
  app.use(timezone);

  if (!isTest) {
    app.use(morgan(':id :method :url :status :response-time ms'));
  }

  app.use('/api/v1', routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
