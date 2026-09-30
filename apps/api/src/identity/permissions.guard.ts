import { CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProblemException } from '../common/problem.exception';
import type { RequestWithContext } from '../common/request-context';
import { REQUIRED_PERMISSIONS_KEY } from './require-permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const granted = new Set(request.staff?.permissions ?? []);
    if (!required.every((permission) => granted.has(permission))) {
      throw new ProblemException(
        403,
        'PERMISSION_DENIED',
        'Bạn không có quyền thực hiện thao tác này.',
      );
    }
    return true;
  }
}
