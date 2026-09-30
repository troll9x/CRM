import { CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProblemException } from '../common/problem.exception';
import type { RequestWithContext } from '../common/request-context';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const rawToken = request.cookies?.[this.auth.cookieName] as string | undefined;
    const authenticated = await this.auth.authenticate(rawToken);
    if (!authenticated) {
      throw new ProblemException(401, 'AUTHENTICATION_REQUIRED', 'Vui lòng đăng nhập để tiếp tục.');
    }
    request.staff = authenticated.staff;
    request.sessionHash = authenticated.sessionHash;
    return true;
  }
}
