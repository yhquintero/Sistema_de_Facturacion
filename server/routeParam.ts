import type { Request } from 'express';

/** These endpoints accept named scalar parameters, never wildcard arrays. */
export function routeParam(req: Pick<Request, 'params'>, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string') {
    throw Object.assign(new Error(`Parámetro de ruta no válido: ${name}.`), { status: 400 });
  }
  return value;
}
