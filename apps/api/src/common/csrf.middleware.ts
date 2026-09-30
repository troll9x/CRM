import type { NextFunction, Response } from 'express';
import type { RequestWithContext } from './request-context';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfProtection(allowedOrigins: Set<string>) {
  return (request: RequestWithContext, response: Response, next: NextFunction): void => {
    if (safeMethods.has(request.method)) {
      next();
      return;
    }

    const fetchSite = request.header('sec-fetch-site');
    const origin = request.header('origin');

    if (fetchSite === 'cross-site' || (origin && !allowedOrigins.has(origin))) {
      response.status(403).json({
        error: {
          code: 'CSRF_REJECTED',
          message: 'Yêu cầu ghi từ nguồn không được tin cậy đã bị từ chối.',
          retryable: false,
        },
        meta: { requestId: request.requestId },
      });
      return;
    }

    next();
  };
}
