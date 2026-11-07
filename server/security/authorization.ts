import type { NextFunction, Request, Response } from 'express';
import { ROLE_INFO, PERMISSION_LABELS, type Permission, type WorkspaceUser } from '../../shared/permissions';
export type Auth = { open: boolean; user: WorkspaceUser | null; tokenHash: string; permissions: Permission[] };
export const auth = (res: Response) => res.locals.auth as Auth;
export function assertCan(res: Response, permission: Permission) {
  if (!auth(res).permissions.includes(permission)) throw Object.assign(new Error(`Tu rol (${auth(res).user ? ROLE_INFO[auth(res).user!.role].label : 'actual'}) no permite: ${PERMISSION_LABELS[permission].toLowerCase()}.`), { status: 403, code: 'FORBIDDEN' });
}
export const requirePermission = (permission: Permission) => (_req: Request, res: Response, next: NextFunction) => { try { assertCan(res, permission); next(); } catch (error) { next(error); } };
