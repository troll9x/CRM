import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { CatalogModule } from './catalog/catalog.module';
import { HealthModule } from './health/health.module';
import { CustomersModule } from './customers/customers.module';
import { AuthenticationGuard } from './identity/authentication.guard';
import { IdentityModule } from './identity/identity.module';
import { PermissionsGuard } from './identity/permissions.guard';
import { PrismaModule } from './prisma/prisma.module';
import { PurchasingModule } from './purchasing/purchasing.module';
import { PricingModule } from './pricing/pricing.module';
import { OverviewModule } from './overview/overview.module';
import { InventoryModule } from './inventory/inventory.module';
import { QuotingModule } from './quoting/quoting.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { ReturnsModule } from './returns/returns.module';
import { ReportsModule } from './reports/reports.module';
import { IntegrationsModule } from './integrations/integrations.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    PrismaModule,
    HealthModule,
    IdentityModule,
    CustomersModule,
    CatalogModule,
    PurchasingModule,
    PricingModule,
    OverviewModule,
    InventoryModule,
    QuotingModule,
    OrdersModule,
    PaymentsModule,
    ShipmentsModule,
    ReturnsModule,
    ReportsModule,
    IntegrationsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
