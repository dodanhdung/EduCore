import { Inject, Injectable } from '@nestjs/common';
import {
  BillingCalculator,
  type ChargeInput,
  vnd,
} from './billing-calculator.js';
import { R2Repository, type R2Result } from './r2-repository.js';

export interface Intent {
  key: string;
  reason: string;
}
function intent(input: Intent) {
  if (!input.key?.trim() || input.key.length > 200 || !input.reason?.trim())
    throw new Error('OPERATION_KEY_AND_REASON_REQUIRED');
  return { key: input.key, reason: input.reason };
}

@Injectable()
export class GenerationService {
  private readonly calculator = new BillingCalculator();
  constructor(
    @Inject(R2Repository) private readonly repository: R2Repository,
  ) {}
  private verify(result: R2Result) {
    const source = result.source as { lines: ChargeInput[]; sibling: boolean };
    const expected = this.calculator.calculate(source.lines, source.sibling);
    for (const key of ['grossVnd', 'discountVnd', 'totalVnd'] as const)
      if (result[key] !== expected[key])
        throw new Error('DATABASE_CALCULATION_MISMATCH');
    return result;
  }
  async initial(
    tenantId: string,
    studentId: string,
    periodId: string,
    input: Intent,
  ) {
    return this.repository.command(
      tenantId,
      {
        ...intent(input),
        operation: 'GENERATE',
        studentId,
        periodId,
      },
      (result) => {
        this.verify(result);
      },
    );
  }
  async recompute(
    tenantId: string,
    studentId: string,
    periodId: string,
    expectedBase: string,
    expectedApplied: string | null,
    input: Intent,
  ) {
    return this.repository.command(
      tenantId,
      {
        ...intent(input),
        operation: 'RECOMPUTE',
        studentId,
        periodId,
        expectedBase,
        expectedApplied,
      },
      (result) => {
        this.verify(result);
      },
    );
  }
}

@Injectable()
export class InvoiceLifecycleService {
  constructor(
    @Inject(R2Repository) private readonly repository: R2Repository,
  ) {}
  receivable(tenantId: string, invoiceId: string) {
    return this.repository.receivable(tenantId, invoiceId);
  }
  issue(tenantId: string, invoiceId: string, input: Intent) {
    return this.repository.command(tenantId, {
      ...intent(input),
      operation: 'ISSUE',
      invoiceId,
    });
  }
  requestAdjustment(
    tenantId: string,
    invoiceId: string,
    deltaVnd: string,
    input: Intent,
  ) {
    const absolute = deltaVnd.startsWith('-') ? deltaVnd.slice(1) : deltaVnd;
    vnd(absolute, false);
    return this.repository.command(tenantId, {
      ...intent(input),
      operation: 'ADJUST_REQUEST',
      invoiceId,
      deltaVnd,
    });
  }
  requestCancellation(tenantId: string, invoiceId: string, input: Intent) {
    return this.repository.command(tenantId, {
      ...intent(input),
      operation: 'CANCEL_REQUEST',
      invoiceId,
    });
  }
}

@Injectable()
export class FinancialCoordinator {
  constructor(
    @Inject(R2Repository) private readonly repository: R2Repository,
  ) {}
  approve(tenantId: string, approvalId: string, input: Intent) {
    return this.repository.command(tenantId, {
      ...intent(input),
      operation: 'APPROVE',
      approvalId,
    });
  }
  execute(tenantId: string, approvalId: string, input: Intent) {
    return this.repository.command(tenantId, {
      ...intent(input),
      operation: 'EXECUTE_APPROVAL',
      approvalId,
    });
  }
}

@Injectable()
export class WalletService {
  constructor(
    @Inject(R2Repository) private readonly repository: R2Repository,
  ) {}
  summary(tenantId: string, studentId: string) {
    return this.repository.summary(tenantId, studentId);
  }
  topUp(
    tenantId: string,
    studentId: string,
    amountVnd: string,
    method: 'CASH' | 'BANK_TRANSFER',
    receiptReference: string,
    evidence: string,
    input: Intent,
  ) {
    vnd(amountVnd, false);
    if (!receiptReference.trim() || !evidence.trim())
      throw new Error('VERIFIED_RECEIPT_REQUIRED');
    return this.repository.command(tenantId, {
      ...intent(input),
      operation: 'TOP_UP',
      studentId,
      amountVnd,
      method,
      receiptReference: receiptReference.normalize('NFC').trim(),
      evidence,
    });
  }
  pay(tenantId: string, invoiceId: string, amountVnd: string, input: Intent) {
    vnd(amountVnd, false);
    return this.repository.command(tenantId, {
      ...intent(input),
      operation: 'PAY',
      invoiceId,
      amountVnd,
    });
  }
  requestTopUpReversal(tenantId: string, topUpId: string, input: Intent) {
    return this.repository.command(tenantId, {
      ...intent(input),
      operation: 'REVERSE_TOP_UP_REQUEST',
      topUpId,
    });
  }
  requestPaymentReversal(
    tenantId: string,
    invoiceId: string,
    paymentId: string,
    input: Intent,
  ) {
    return this.repository.command(tenantId, {
      ...intent(input),
      operation: 'REVERSE_PAYMENT_REQUEST',
      invoiceId,
      paymentId,
    });
  }
}
