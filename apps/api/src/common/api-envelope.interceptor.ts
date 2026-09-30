import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { RequestWithContext } from './request-context';

@Injectable()
export class ApiEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    return next.handle().pipe(
      map((data: unknown) => ({
        data: data ?? null,
        meta: { requestId: request.requestId },
      })),
    );
  }
}
