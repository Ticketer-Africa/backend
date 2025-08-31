import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import {
  PaymentDTO,
  PayinResponse,
  sanitizeMetadata,
  VerifyResponse,
  WithdrawalDTO,
  WithdrawalResponse,
} from '../dto/initiate.dto';
import { IPayinProvider } from '../interface/payin-provider.interface';

@Injectable()
export class AggregatorPayinProvider implements IPayinProvider {
  private readonly logger = new Logger(AggregatorPayinProvider.name);
  private readonly baseUrl: string;
  private readonly secretKey: string;

  constructor(private httpService: HttpService) {
    this.baseUrl = process.env.PAYMENT_GATEWAY_URL || '';
    this.secretKey = process.env.PAYMENT_GATEWAY_TEST_SECRET || '';
    if (!this.baseUrl || !this.secretKey) {
      throw new Error('Aggregator configuration is missing');
    }
  }

  // ===================== Payin Helpers =====================
  private preparePayinPayload(dto: PaymentDTO) {
    return {
      amount: dto.amount,
      currency: dto.currency,
      reference: dto.reference,
      customer: dto.customer,
      processor: 'kora',
      redirect_url: dto.redirectUrl,
      notification_url: dto.notificationUrl,
      narration: dto.narration,
      mode: 'card',
      metadata: sanitizeMetadata(dto.metadata),
    };
  }

  private async sendPayinRequest(payload: any): Promise<PayinResponse> {
    try {
      const response = await this.httpService
        .post(`${this.baseUrl}/api/v1/initiate`, payload, {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        })
        .toPromise();

      if (!response || !response.data) {
        this.logger.error(
          'Aggregator initiation failed: No response data received',
        );
        throw new InternalServerErrorException(
          'Failed to initiate payin with Aggregator: No response data received',
        );
      }
      const resData = response.data;
      return {
        status: !!resData.checkout_url,
        message: resData.message || 'Payin initiated successfully',
        data: {
          reference: payload.reference,
          checkoutUrl: resData.checkout_url,
        },
      };
    } catch (err) {
      this.logger.error(`Aggregator initiation failed: ${err.message}`);
      throw new InternalServerErrorException(
        `Failed to initiate payin with Aggregator: ${err.response?.data?.message || err.message}`,
      );
    }
  }

  async initiatePayin(dto: PaymentDTO): Promise<PayinResponse> {
    this.logger.log(
      `Initiating Aggregator payin with reference: ${dto.reference}`,
    );
    const payload = this.preparePayinPayload(dto);
    return this.sendPayinRequest(payload);
  }

  // ===================== Verification Helpers =====================
  private async sendVerifyRequest(reference: string): Promise<VerifyResponse> {
    const verifyUrl = `${this.baseUrl}/api/v1/transactions/verify?reference=${reference}`;
    try {
      const response = await this.httpService
        .get(verifyUrl, {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        })
        .toPromise();

      if (!response || !response.data) {
        this.logger.error(
          'Aggregator verification failed: No response data received',
        );
        throw new InternalServerErrorException(
          'Failed to verify transaction with Aggregator: No response data received',
        );
      }

      const { status, message } = response.data;
      if (!status || message !== 'verification successful') {
        this.logger.error(
          `Verification failed for ${reference}: status=${status}, message=${message}`,
        );
        throw new BadRequestException('Transaction verification failed');
      }

      return {
        status: true,
        message: 'Verification successful',
        data: {
          reference,
          status: 'success',
          amount: 0,
          currency: 'NGN',
          paymentMethod: 'unknown',
          fee: 0,
        },
      };
    } catch (err) {
      this.logger.error(`Aggregator verification failed: ${err.message}`);
      throw new InternalServerErrorException(
        `Failed to verify transaction with Aggregator: ${err.response?.data?.message || err.message}`,
      );
    }
  }

  async verifyTransaction(reference: string): Promise<VerifyResponse> {
    if (!reference) {
      this.logger.error('Verification failed: Reference is undefined');
      throw new BadRequestException('Transaction reference is required');
    }

    this.logger.log(
      `Verifying Aggregator transaction with reference: ${reference}`,
    );
    return this.sendVerifyRequest(reference);
  }

  // ===================== Withdrawal =====================
  private prepareWithdrawalPayload(dto: WithdrawalDTO) {
    if (dto.currency !== 'NGN') {
      throw new BadRequestException('Only NGN is supported for withdrawals');
    }
    if (dto.destination.type !== 'bank_account') {
      throw new BadRequestException(
        'Only bank_account withdrawals are supported',
      );
    }
    if (
      !dto.destination.bank_account?.bank ||
      !dto.destination.bank_account?.account
    ) {
      throw new BadRequestException(
        'Bank code and account number are required',
      );
    }

    return {
      amount: dto.amount,
      currency: dto.currency,
      reference: dto.reference,
      narration: dto.narration || `Withdrawal for ${dto.reference}`,
      customer: dto.customer,
      destination: {
        type: 'bank_account',
        bank_account: {
          bank: dto.destination.bank_account.bank,
          account: dto.destination.bank_account.account,
          account_name: dto.customer.name || 'Unknown',
        },
      },
      metadata: sanitizeMetadata(dto.metadata),
    };
  }

  private async sendWithdrawalRequest(
    payload: any,
  ): Promise<WithdrawalResponse> {
    try {
      const response = await this.httpService
        .post(`${this.baseUrl}/api/v1/payout`, payload, {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        })
        .toPromise();

      if (!response || !response.data) {
        this.logger.error(
          'Aggregator withdrawal failed: No response data received',
        );
        throw new InternalServerErrorException(
          'Failed to initiate withdrawal with Aggregator: No response data received',
        );
      }

      const resData = response.data;
      return {
        status: resData.status || true,
        message: resData.message || 'Withdrawal initiated successfully',
        data: {
          reference: payload.reference,
          amount: resData.amount || payload.amount.toString(),
          fee: resData.fee || '0',
          currency: payload.currency,
          status: resData.status || 'processing',
          narration: payload.narration,
          customer: payload.customer,
          metadata: payload.metadata,
        },
      };
    } catch (err) {
      this.logger.error(`Aggregator withdrawal failed: ${err.message}`);
      throw new InternalServerErrorException(
        `Failed to initiate withdrawal with Aggregator: ${err.response?.data?.message || err.message}`,
      );
    }
  }

  async initiateWithdrawal(dto: WithdrawalDTO): Promise<WithdrawalResponse> {
    this.logger.log(
      `Initiating Aggregator withdrawal with reference: ${dto.reference}`,
    );
    const payload = this.prepareWithdrawalPayload(dto);
    return this.sendWithdrawalRequest(payload);
  }

  // ===================== Bank Codes =====================
  async fetchBankCodes(): Promise<any> {
    this.logger.log('Fetching bank codes from Aggregator');
    try {
      const response = await this.httpService
        .get(`${this.baseUrl}/api/v1/banks`, {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        })
        .toPromise();

      if (!response || !response.data) {
        this.logger.error('Failed to fetch bank codes: No response data');
        throw new InternalServerErrorException(
          'Failed to fetch bank codes from Aggregator: No response data',
        );
      }
      return response.data;
    } catch (err) {
      this.logger.error(`Failed to fetch bank codes: ${err.message}`);
      throw new InternalServerErrorException(
        `Failed to fetch bank codes from Aggregator: ${err.response?.data?.message || err.message}`,
      );
    }
  }
}
