import type { Request, Response } from 'express';

import * as categoryService from '@/services/category.service';
import type {
  CategoryIdParams,
  CreateCategoryInput,
  DeleteCategoryQuery,
  ListCategoriesQuery,
  UpdateCategoryInput,
} from '@/validators/category.validator';

export async function list(req: Request, res: Response): Promise<void> {
  const result = await categoryService.list(
    req.user!.id,
    req.validated.query as ListCategoriesQuery,
  );
  res.json(result);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = req.validated.params as CategoryIdParams;
  const category = await categoryService.getById(req.user!.id, id);
  res.json(category);
}

export async function create(req: Request, res: Response): Promise<void> {
  const category = await categoryService.create(
    req.user!.id,
    req.validated.body as CreateCategoryInput,
  );
  res.status(201).json(category);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.validated.params as CategoryIdParams;
  const category = await categoryService.update(
    req.user!.id,
    id,
    req.validated.body as UpdateCategoryInput,
  );
  res.json(category);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.validated.params as CategoryIdParams;
  const { reassignTo } = req.validated.query as DeleteCategoryQuery;
  await categoryService.remove(req.user!.id, id, reassignTo);
  res.status(204).send();
}
