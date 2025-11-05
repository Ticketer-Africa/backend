import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';

// Generic Payment DTO
export interface PaymentDTO {
  amount: number;
  currency: string;
  reference: string;
  redirectUrl?: string;
  notificationUrl?: string;
  narration?: string;
  processor?: string;
  channels?: string[];
  defaultChannel?: string;
  metadata?: Record<string, any>;
  customer: { email: string; name?: string };
  merchantBearsCost?: boolean;
}

// Generic Withdrawal DTO
export interface WithdrawalDTO {
  amount: number;
  currency: string;
  reference: string;
  narration?: string;
  notificationUrl?: string;
  metadata?: Record<string, any>;
  customer: { email: string; name?: string };
  destination: {
    type: 'bank_account' | 'mobile_money';
    bank_account?: {
      bank: string;
      account: string;
      account_name?: string;
      first_name?: string;
      last_name?: string;
      payment_method?: { type: string; value: string };
      address_information?: {
        country: string;
        city: string;
        state: string;
        zip_code: string;
        street: string;
        full_address: string;
      };
    };
    mobile_money?: {
      operator: string;
      mobile_number: string;
    };
  };
}

// Generic Payin Response
export interface PayinResponse {
  status: boolean;
  message: string;
  data: { reference: string; checkoutUrl?: string };
}

// Generic Withdrawal Response
export interface WithdrawalResponse {
  status: boolean;
  message: string;
  data: {
    reference: string;
    amount: string;
    fee: string;
    currency: string;
    status: string;
    narration: string;
    customer: { name: string; email: string; phone: string | null };
    metadata?: Record<string, any>;
  };
}

// Helper Functions
export function validateDTO(dto: PaymentDTO | WithdrawalDTO): void {
  if (!dto.amount || dto.amount <= 0) {
    throw new BadRequestException('Amount is required and must be positive');
  }
  if (!dto.currency || dto.currency.length !== 3) {
    throw new BadRequestException(
      'Currency is required and must be a valid ISO 4217 code',
    );
  }
  if (!dto.reference) {
    throw new BadRequestException('Reference is required');
  }
  if (!dto.customer || !dto.customer.email) {
    throw new BadRequestException('Customer email is required');
  }
}

export function sanitizeMetadata(
  metadata?: Record<string, any>,
): Record<string, any> | undefined {
  if (!metadata) return undefined;
  const keys = Object.keys(metadata);
  if (keys.length > 5) {
    throw new BadRequestException('Metadata cannot exceed 5 keys');
  }
  for (const key of keys) {
    if (key.length > 20 || !/^[A-Za-z0-9-]+$/.test(key)) {
      throw new BadRequestException(
        'Metadata keys must be alphanumeric or hyphens and max 20 characters',
      );
    }
  }
  return metadata;
}

export function generateReference(): string {
  return `REF-${randomBytes(8).toString('hex').toUpperCase()}`;
}

export interface IVerifyProvider {
  verifyTransaction(reference: string): Promise<VerifyResponse>;
}

export interface VerifyResponse {
  status: boolean;
  message: string;
  data: {
    reference: string;
    status: string;
    amount: number;
    currency: string;
    paymentMethod?: string;
    fee?: number;
  };
}
