import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RolesController } from './roles.controller';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  controllers: [AuthController, StaffController, RolesController],
  providers: [AuthService, StaffService],
  exports: [AuthService],
})
export class IdentityModule {}
