import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { RequestStaff, RequestWithContext } from '../common/request-context';

export const CurrentStaff = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestStaff | undefined =>
    context.switchToHttp().getRequest<RequestWithContext>().staff,
);
