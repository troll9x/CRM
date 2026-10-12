import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../identity/public.decorator';
import { CurrentStaff } from '../identity/current-staff.decorator';
import { PERMISSIONS } from '../identity/permissions';
import { RequirePermissions } from '../identity/require-permissions.decorator';
import type { RequestStaff } from '../common/request-context';
import { FacebookStartDto, ZaloFinalizeDto } from './integration.dto';
import { ZaloAuthService } from './zalo-auth.service';

@Controller('integrations/oauth/zalo')
export class ZaloAuthController {
  constructor(private readonly auth: ZaloAuthService) {}

  @Post('start')
  @RequirePermissions(PERMISSIONS.CONNECTORS_MANAGE)
  start(@CurrentStaff() actor: RequestStaff, @Body() dto: FacebookStartDto) {
    return this.auth.start(actor, dto.reconnectConnectionId);
  }

  @Public()
  @Get('callback')
  async callback(
    @Query('state') state: string | undefined,
    @Query('code') code: string | undefined,
    @Query('oa_id') oaId: string | undefined,
    @Query('error') error: string | undefined,
    @Res() response: Response,
  ) {
    const destination = await this.auth.callback({ state, code, oaId, error });
    return response.redirect(303, destination);
  }

  @Get('attempts/:id')
  @RequirePermissions(PERMISSIONS.CONNECTORS_MANAGE)
  attempt(@CurrentStaff() actor: RequestStaff, @Param('id') id: string) {
    return this.auth.attempt(actor, id);
  }

  @Post('attempts/:id/finalize')
  @RequirePermissions(PERMISSIONS.CONNECTORS_MANAGE)
  finalize(
    @CurrentStaff() actor: RequestStaff,
    @Param('id') id: string,
    @Body() dto: ZaloFinalizeDto,
  ) {
    return this.auth.finalize(actor, id, dto.oaId);
  }

  @Post('connections/:id/disconnect')
  @RequirePermissions(PERMISSIONS.CONNECTORS_MANAGE)
  disconnect(@CurrentStaff() actor: RequestStaff, @Param('id') id: string) {
    return this.auth.disconnect(actor, id);
  }
}
