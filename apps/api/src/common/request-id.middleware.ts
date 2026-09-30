import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { RequestWithContext } from './request-context';

export function requestIdMiddleware(
  request: RequestWithContext,
  response: Response,
  next: NextFunction,
): void {
  const incoming = request.header('x-request-id');
  request.requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
  response.setHeader('x-request-id', request.requestId);
  next();
}
