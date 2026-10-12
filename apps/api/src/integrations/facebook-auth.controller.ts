import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentStaff } from '../identity/current-staff.decorator';
import { Public } from '../identity/public.decorator';
import { PERMISSIONS } from '../identity/permissions';
import { RequirePermissions } from '../identity/require-permissions.decorator';
import type { RequestStaff } from '../common/request-context';
import { FacebookAuthService } from './facebook-auth.service';
import { FacebookFinalizeDto, FacebookStartDto } from './integration.dto';

@Controller('integrations/oauth/facebook')
export class FacebookAuthController {
  constructor(private readonly auth: FacebookAuthService) {}

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
    @Query('error') error: string | undefined,
    @Res() response: Response,
  ) {
    const destination = await this.auth.callback({ state, code, error });
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
    @Body() dto: FacebookFinalizeDto,
  ) {
    return this.auth.finalize(actor, id, dto.pageId);
  }

  @Post('connections/:id/disconnect')
  @RequirePermissions(PERMISSIONS.CONNECTORS_MANAGE)
  disconnect(@CurrentStaff() actor: RequestStaff, @Param('id') id: string) {
    return this.auth.disconnect(actor, id);
  }
}
