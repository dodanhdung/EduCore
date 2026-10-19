import { Module, type DynamicModule } from '@nestjs/common';
import { R2_CONNECTION, R2Repository } from './r2-repository.js';
import {
  FinancialCoordinator,
  GenerationService,
  InvoiceLifecycleService,
  WalletService,
} from './billing-services.js';

/** Internal services only. No controller/mounted REST route or production auth
 * adapter is shipped. Connection identity must be provisioned and bound by a
 * trusted composition root; privileged fixture credentials are never defaults.
 */
@Module({})
export class BillingModule {
  static register(connection: string): DynamicModule {
    return {
      module: BillingModule,
      providers: [
        { provide: R2_CONNECTION, useValue: connection },
        R2Repository,
        GenerationService,
        InvoiceLifecycleService,
        FinancialCoordinator,
        WalletService,
      ],
      exports: [
        GenerationService,
        InvoiceLifecycleService,
        FinancialCoordinator,
        WalletService,
      ],
    };
  }
}
