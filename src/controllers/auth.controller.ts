import type { Request, Response } from 'express';

import * as authService from '@/services/auth.service';
import type {
  ForgotPasswordInput,
  LoginInput,
  LogoutInput,
  RefreshInput,
  RegisterInput,
  UpdateMeInput,
} from '@/validators/auth.validator';

export async function register(req: Request, res: Response): Promise<void> {
  const result = await authService.register(req.validated.body as RegisterInput);
  res.status(201).json(result);
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.validated.body as LoginInput);
  res.json(result);
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const result = await authService.refresh(req.validated.body as RefreshInput);
  res.json(result);
}

export async function logout(req: Request, res: Response): Promise<void> {
  await authService.logout(req.validated.body as LogoutInput);
  res.status(204).send();
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const user = await authService.getMe(req.user!.id);
  res.json(user);
}

export async function updateMe(req: Request, res: Response): Promise<void> {
  const user = await authService.updateMe(req.user!.id, req.validated.body as UpdateMeInput);
  res.json(user);
}

export function forgotPassword(req: Request, res: Response): void {
  const result = authService.forgotPassword(req.validated.body as ForgotPasswordInput);
  res.status(202).json(result);
}
