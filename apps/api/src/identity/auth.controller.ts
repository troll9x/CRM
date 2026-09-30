import { Body, Controller, Delete, Get, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { RequestWithContext } from '../common/request-context';
import { AuthService } from './auth.service';
import { CurrentStaff } from './current-staff.decorator';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';
import type { RequestStaff } from '../common/request-context';

@ApiTags('authentication')
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('auth/sessions')
  @ApiOperation({ summary: 'Đăng nhập nhân viên và tạo phiên HttpOnly' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(dto.email, dto.password, {
      ipAddress: request.ip,
      userAgent: request.header('user-agent'),
      requestId: request.requestId,
    });
    response.cookie(this.auth.cookieName, result.rawToken, {
      httpOnly: true,
      secure: this.auth.secureCookie,
      sameSite: 'lax',
      path: '/',
      maxAge: this.auth.ttlMilliseconds,
    });
    return { staff: result.staff, expiresAt: result.expiresAt.toISOString() };
  }

  @Delete('auth/session')
  @ApiOperation({ summary: 'Đăng xuất và thu hồi phiên hiện tại' })
  async logout(
    @Req() request: RequestWithContext,
    @CurrentStaff() staff: RequestStaff,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(request.sessionHash!, staff, request.requestId);
    response.clearCookie(this.auth.cookieName, {
      httpOnly: true,
      secure: this.auth.secureCookie,
      sameSite: 'lax',
      path: '/',
    });
    return { loggedOut: true };
  }

  @Get('me')
  @ApiOperation({ summary: 'Lấy nhân viên, doanh nghiệp, vai trò và quyền hiện tại' })
  me(@CurrentStaff() staff: RequestStaff) {
    return staff;
  }
}
