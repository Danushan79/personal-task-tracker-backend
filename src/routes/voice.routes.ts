import { Router } from 'express';
import multer from 'multer';

import { parseTask, transcribe } from '@/controllers/voice.controller';
import { authenticate } from '@/middleware/authenticate';
import { voiceLimiter } from '@/middleware/rate-limit';
import { validate } from '@/middleware/validate';
import { ApiError } from '@/utils/api-error';
import { parseTaskSchema } from '@/validators/voice.validator';

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith('audio/')) {
      callback(ApiError.badRequest('Only audio files are accepted'));
      return;
    }
    callback(null, true);
  },
});

const router = Router();
router.use(authenticate);
router.use(voiceLimiter);

router.post('/transcribe', upload.single('audio'), transcribe);
router.post('/parse-task', validate({ body: parseTaskSchema }), parseTask);

export default router;
