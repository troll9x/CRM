import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  controllers: [CustomersController, TasksController, OpportunitiesController],
  providers: [CustomersService, TasksService, OpportunitiesService],
})
export class CustomersModule {}
