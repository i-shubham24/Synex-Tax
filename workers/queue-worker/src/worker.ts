import { normalizeInvoiceNumber, compareInvoices } from './jobs/invoiceNormalizerJob.js';
import { ImsPre14AlertEngine } from './jobs/imsPre14AlertJob.js';

export class QueueWorkerService {
  public static init() {
    console.log('⚡ SynexTax Queue Worker Service initialized.');
    console.log('Registered jobs: [invoice-normalization, ims-pre14-alerts, fvu-batch-validation]');
  }
}

export * from './jobs/invoiceNormalizerJob.js';
export * from './jobs/imsPre14AlertJob.js';
export * from './recon/reconciliationEngine.js';
