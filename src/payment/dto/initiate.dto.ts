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

// Generic Payin Response
export interface PayinResponse {
  status: boolean;
  message: string;
  data: { reference: string; checkoutUrl?: string };
}

// Helper Functions
export function validateDTO(dto: PaymentDTO): void {
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
  return metadata;
}

export function generateReference(): string {
  return `REF-${randomBytes(8).toString('hex').toUpperCase()}`;
}
