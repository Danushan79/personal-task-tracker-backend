import type { Request, Response } from 'express';

import * as voiceService from '@/services/voice.service';
import { ApiError } from '@/utils/api-error';
import type { ParseTaskInput } from '@/validators/voice.validator';

export async function transcribe(req: Request, res: Response): Promise<void> {
  if (!req.file) throw ApiError.badRequest('An "audio" file is required');

  const text = await voiceService.transcribeAudio(req.file.buffer, req.file.mimetype);
  res.json({ text });
}

export async function parseTask(req: Request, res: Response): Promise<void> {
  const { text } = req.validated.body as ParseTaskInput;
  const draft = await voiceService.parseTaskFromText(req.user!.id, req.timezone, text);
  res.json(draft);
}
