import OpenAI, { toFile } from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import { env } from '@/config/env';
import { Category } from '@/models/category.model';
import { isoDateSchema, isoTimeSchema } from '@/validators/common';
import { prioritySchema, recurrenceSchema } from '@/validators/task.validator';
import { ApiError } from '@/utils/api-error';
import { todayInTz } from '@/utils/date';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export interface ParsedTaskDraft {
  title: string;
  description: string | null;
  categoryId: string | null;
  dueDate: string | null;
  dueTime: string | null;
  recurrence: z.infer<typeof recurrenceSchema>;
  priority: z.infer<typeof prioritySchema>;
}

/** Sends a recorded clip to Whisper and returns the raw transcript. */
export async function transcribeAudio(buffer: Buffer, mimetype: string): Promise<string> {
  let transcription;
  try {
    const file = await toFile(buffer, `recording.${extensionFor(mimetype)}`, { type: mimetype });
    transcription = await openai.audio.transcriptions.create({
      file,
      model: env.OPENAI_TRANSCRIBE_MODEL,
    });
  } catch {
    throw ApiError.internal('Voice transcription is temporarily unavailable. Please try again.');
  }

  const text = transcription.text?.trim() ?? '';
  if (!text) throw new ApiError(422, "Didn't catch that — try again.");

  return text;
}

function extensionFor(mimetype: string): string {
  if (mimetype.includes('mp4') || mimetype.includes('m4a')) return 'm4a';
  if (mimetype.includes('wav')) return 'wav';
  if (mimetype.includes('webm')) return 'webm';
  return 'm4a';
}

/**
 * Model-facing response shape. `categoryId` is a dynamic enum of the caller's *real*
 * category ids (plus null) so the model cannot name a category that doesn't exist —
 * everything else is still re-validated below, since strict mode only constrains the
 * model's output shape, not what the API actually enforces on delivery.
 */
function buildDraftSchema(categoryIds: string[]) {
  return z.object({
    title: z.string(),
    description: z.string().nullable(),
    categoryId:
      categoryIds.length > 0
        ? z.enum(categoryIds as [string, ...string[]]).nullable()
        : z.null(),
    dueDate: z.string().nullable(),
    dueTime: z.string().nullable(),
    recurrence: recurrenceSchema,
    priority: prioritySchema,
  });
}

const SYSTEM_PROMPT = `You turn a spoken task description into structured task fields for a personal task tracker.

Rules:
- "title" is short and imperative (e.g. "Call mom", "Submit Q3 report"). Required, never empty.
- "description" holds any extra detail beyond the title; null if there is none.
- "categoryId" is the id of the best-matching category from the provided list, or null if nothing fits or no categories exist.
- "dueDate" is "YYYY-MM-DD" resolved against the given current date, or null if no date was mentioned. Resolve relative phrases ("tomorrow", "next Friday", "in two weeks") against the current date given below.
- "dueTime" is "HH:mm" 24-hour, or null if no specific time was mentioned. Never set a time without also setting dueDate.
- "recurrence" is "daily", "weekly", or "monthly" only if repetition was explicitly mentioned ("every day", "each week"); otherwise "none".
- "priority" is "high" if urgency was implied (e.g. "urgent", "ASAP", "important"), "low" if explicitly low-stakes, otherwise "medium".`;

/** Sends the transcript + the user's own categories to the model and returns a validated draft. */
export async function parseTaskFromText(
  userId: string,
  timezone: string,
  text: string,
): Promise<ParsedTaskDraft> {
  const categories = await Category.find({ userId }).select('name');
  const categoryList = categories.map((c) => ({ id: c.id, name: c.name }));
  const { date, weekday } = todayInTz(timezone);

  const userPrompt = [
    `Current date: ${date} (${weekday}), timezone: ${timezone}.`,
    `Categories: ${JSON.stringify(categoryList)}`,
    `Transcript: """${text}"""`,
  ].join('\n');

  let parsed: z.infer<ReturnType<typeof buildDraftSchema>> | null;
  try {
    const completion = await openai.chat.completions.parse({
      model: env.OPENAI_PARSE_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: zodResponseFormat(
        buildDraftSchema(categoryList.map((c) => c.id)),
        'task_draft',
      ),
    });
    parsed = completion.choices[0]?.message.parsed ?? null;
  } catch {
    throw ApiError.internal('Filling in your task is temporarily unavailable. Please try again.');
  }

  if (!parsed) throw ApiError.internal('Could not fill in your task from that recording.');

  return sanitizeDraft(parsed, categoryList.map((c) => c.id), text);
}

/** Never trust model output blindly — re-validate every field against the same rules `task.validator.ts` enforces. */
function sanitizeDraft(
  draft: z.infer<ReturnType<typeof buildDraftSchema>>,
  categoryIds: string[],
  fallbackText: string,
): ParsedTaskDraft {
  const title = draft.title.trim().slice(0, 200) || fallbackText.trim().slice(0, 200);
  const description = draft.description?.trim().slice(0, 2000) || null;
  const categoryId = draft.categoryId && categoryIds.includes(draft.categoryId) ? draft.categoryId : null;

  const dueDate = draft.dueDate && isoDateSchema.safeParse(draft.dueDate).success ? draft.dueDate : null;
  const dueTime =
    dueDate && draft.dueTime && isoTimeSchema.safeParse(draft.dueTime).success ? draft.dueTime : null;

  return {
    title,
    description,
    categoryId,
    dueDate,
    dueTime,
    recurrence: draft.recurrence,
    priority: draft.priority,
  };
}
