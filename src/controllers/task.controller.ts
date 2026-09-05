import type { Request, Response } from 'express';

import * as taskService from '@/services/task.service';
import type {
  CreateTaskInput,
  ListTasksQuery,
  RescheduleTaskInput,
  TaskIdParams,
  UpdateTaskInput,
} from '@/validators/task.validator';

export async function list(req: Request, res: Response): Promise<void> {
  const result = await taskService.list(
    req.user!.id,
    req.timezone,
    req.validated.query as ListTasksQuery,
  );
  res.json(result);
}

export async function create(req: Request, res: Response): Promise<void> {
  const task = await taskService.create(
    req.user!.id,
    req.timezone,
    req.validated.body as CreateTaskInput,
  );
  res.status(201).json(task);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = req.validated.params as TaskIdParams;
  const task = await taskService.get(req.user!.id, req.timezone, id);
  res.json(task);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.validated.params as TaskIdParams;
  const task = await taskService.update(
    req.user!.id,
    req.timezone,
    id,
    req.validated.body as UpdateTaskInput,
  );
  res.json(task);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.validated.params as TaskIdParams;
  await taskService.remove(req.user!.id, id);
  res.status(204).send();
}

export async function reschedule(req: Request, res: Response): Promise<void> {
  const { id } = req.validated.params as TaskIdParams;
  const task = await taskService.reschedule(
    req.user!.id,
    req.timezone,
    id,
    req.validated.body as RescheduleTaskInput,
  );
  res.json(task);
}

export async function complete(req: Request, res: Response): Promise<void> {
  const { id } = req.validated.params as TaskIdParams;
  const result = await taskService.complete(req.user!.id, req.timezone, id);
  res.json(result);
}

export async function reopen(req: Request, res: Response): Promise<void> {
  const { id } = req.validated.params as TaskIdParams;
  const task = await taskService.reopen(req.user!.id, req.timezone, id);
  res.json(task);
}
