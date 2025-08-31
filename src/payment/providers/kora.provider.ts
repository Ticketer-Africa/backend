/* eslint-disable prettier/prettier */
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
export class KoraPayinProvider implements IPayinProvider {
  private readonly logger = new Logger(KoraPayinProvider.name);
  private readonly baseUrl: string;
  private readonly secretKey: string;
  private readonly publicKey: string;
  private readonly supportedChannels = [
    'card',
    'bank_transfer',
    'mobile_money',
  ];

  constructor(private httpService: HttpService) {
    this.baseUrl = process.env.KORA_API_URL || '';
    this.secretKey = process.env.KORA_API_TEST_SECRET || '';
    this.publicKey = process.env.KORA_API_TEST_KEY || '';
    if (!this.baseUrl || !this.secretKey || !this.publicKey) {
      throw new Error('Korapay configuration is missing');
    }
  }

  // ===================== Payin Helpers =====================
  private preparePayinPayload(dto: PaymentDTO) {
    const amount = dto.currency === 'NGN' ? Math.round(dto.amount * 100) / 100 : dto.amount;
    const channels =
      dto.channels?.filter((c) => this.supportedChannels.includes(c)) ||
      this.supportedChannels;
    const defaultChannel =
      dto.defaultChannel && this.supportedChannels.includes(dto.defaultChannel)
        ? dto.defaultChannel
        : 'card';

    return {
      amount,
      currency: dto.currency,
      reference: dto.reference,
      customer: dto.customer,
      redirect_url: dto.redirectUrl,
      notification_url: dto.notificationUrl,
      narration: dto.narration || `Payment for ${dto.reference}`,
      channels: channels.length > 0 ? channels : undefined,
      default_channel: channels.includes(defaultChannel)
        ? defaultChannel
        : undefined,
      metadata: sanitizeMetadata(dto.metadata),
      merchant_bears_cost: true,
    };
  }

  private async sendPayinRequest(payload: any): Promise<PayinResponse> {
    try {
      const response = await this.httpService
        .post(`${this.baseUrl}/charges/initialize`, payload, {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        })
        .toPromise();

      if (!response || !response.data || !response.data.data) {
        this.logger.error('Korapay response is missing expected data');
        throw new InternalServerErrorException(
          'Korapay response is missing expected data',
        );
      }
      const resData = response.data.data;
      return {
        status: response.data.status,
        message: response.data.message,
        data: {
          reference: payload.reference,
          checkoutUrl: resData.checkout_url,
        },
      };
    } catch (err) {
      this.logger.error(`Korapay initiation failed: ${err.message}`);
      this.logger.error(
        `Raw error response: ${JSON.stringify(err?.response?.data, null, 2)}`,
      );
      throw new InternalServerErrorException(
        `Failed to initiate payin with Korapay: ${err.response?.data?.message || err.message}`,
      );
    }
  }

  async initiatePayin(dto: PaymentDTO): Promise<PayinResponse> {
    this.logger.log(
      `Initiating Korapay payin with reference: ${dto.reference}`,
    );
    const payload = this.preparePayinPayload(dto);
    return this.sendPayinRequest(payload);
  }

  // ===================== Verification Helpers =====================
  private async sendVerifyRequest(reference: string): Promise<VerifyResponse> {
    try {
      const response = await this.httpService
        .get(`${this.baseUrl}/transactions/${reference}`, {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        })
        .toPromise();

      if (!response || !response.data || !response.data.data) {
        this.logger.error(
          'Korapay verification response is missing expected data',
        );
        throw new InternalServerErrorException(
          'Korapay verification response is missing expected data',
        );
      }

      const resData = response.data.data;
      return {
        status: resData.status === 'success',
        message:
          resData.status === 'success'
            ? 'Verification successful'
            : 'Transaction not successful',
        data: {
          reference: resData.reference,
          status: resData.status,
          amount: resData.amount,
          currency: resData.currency,
          paymentMethod: resData.payment_method,
          fee: resData.fee,
        },
      };
    } catch (err) {
      this.logger.error(`Korapay verification failed: ${err.message}`);
      throw new InternalServerErrorException(
        `Failed to verify transaction with Korapay: ${err.response?.data?.message || err.message}`,
      );
    }
  }

  async verifyTransaction(reference: string): Promise<VerifyResponse> {
    if (!reference) {
      this.logger.error('Verification failed: Reference is undefined');
      throw new BadRequestException('Transaction reference is required');
    }

    this.logger.log(
      `Verifying Korapay transaction with reference: ${reference}`,
    );
    return this.sendVerifyRequest(reference);
  }

  // ===================== Withdrawal Helpers =====================
  private async getBankName(bankCode: string): Promise<string> {
    try {
      const banks = await this.fetchBankCodes();
      const bank = banks.data?.find((b: any) => b.code === bankCode);
      if (!bank) {
        this.logger.error(`Bank not found for code: ${bankCode}`);
        throw new BadRequestException(`Invalid bank code: ${bankCode}`);
      }
      return bank.name || 'Unknown Bank';
    } catch (err) {
      this.logger.error(`Failed to resolve bank name for code ${bankCode}: ${err.message}`);
      throw new BadRequestException(`Failed to resolve bank name: ${err.message}`);
    }
  }

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
      !dto.destination.bank_account?.account ||
      !dto.destination.bank_account?.account_name
    ) {
      throw new BadRequestException(
        'Bank code, account number, and account name are required',
      );
    }
    if (!dto.customer.email) {
      throw new BadRequestException('Customer email is required');
    }

    return {
      reference: dto.reference,
      destination: {
        type: 'bank_account',
        amount: Math.round(dto.amount * 100) / 100, // Ensure two decimal places
        currency: dto.currency,
        narration: dto.narration || `Withdrawal for ${dto.reference}`,
        customer: {
          name: dto.customer.name || 'Unknown',
          email: dto.customer.email,
        },
        bank_account: {
          bank: dto.destination.bank_account.bank,
          account: dto.destination.bank_account.account,
          account_name: dto.destination.bank_account.account_name,
        },
      },
      metadata: sanitizeMetadata(dto.metadata),
    };
  }

  private async sendWithdrawalRequest(
    payload: any,
  ): Promise<WithdrawalResponse> {
    try {
      // Resolve bank_name for bank_account
      payload.destination.bank_account.bank_name = await this.getBankName(
        payload.destination.bank_account.bank,
      );

      this.logger.log(`Sending KoraPay withdrawal request: ${JSON.stringify(payload, null, 2)}`);

      const response = await this.httpService
        .post(`${this.baseUrl}/transactions/disburse`, payload, {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        })
        .toPromise();

      if (!response || !response.data || !response.data.data) {
        this.logger.error(
          'Korapay withdrawal response is missing expected data',
        );
        throw new InternalServerErrorException(
          'Korapay withdrawal response is missing expected data',
        );
      }

      const resData = response.data.data;
      return {
        status: response.data.status,
        message: resData.message || 'Withdrawal initiated successfully',
        data: {
          reference: resData.reference,
          amount: resData.amount,
          fee: resData.fee,
          currency: resData.currency,
          status: resData.status,
          narration: resData.narration,
          customer: resData.customer,
          metadata: resData.metadata,
        },
      };
    } catch (err) {
      this.logger.error(`Korapay withdrawal failed: ${err.message}`);
      this.logger.error(
        `Raw error response: ${JSON.stringify(err?.response?.data, null, 2)}`,
      );
      throw new InternalServerErrorException(
        `Failed to initiate withdrawal with Korapay: ${err.response?.data?.message || err.message}`,
      );
    }
  }

  async initiateWithdrawal(dto: WithdrawalDTO): Promise<WithdrawalResponse> {
    this.logger.log(
      `Initiating Korapay withdrawal with reference: ${dto.reference}`,
    );
    const payload = this.prepareWithdrawalPayload(dto);
    return this.sendWithdrawalRequest(payload);
  }

  // ===================== Bank Codes =====================
  async fetchBankCodes(): Promise<any> {
    this.logger.log('Fetching bank codes from Korapay');
    try {
      const response = await this.httpService
        .get(`${this.baseUrl}/misc/banks?countryCode=NG`, {
          headers: {
            Authorization: `Bearer ${this.publicKey}`,
            'Content-Type': 'application/json',
          },
        })
        .toPromise();

      if (!response || !response.data) {
        this.logger.error('Failed to fetch bank codes: No response data');
        throw new InternalServerErrorException(
          'Failed to fetch bank codes from Korapay: No response data',
        );
      }
      return response.data;
    } catch (err) {
      this.logger.error(`Failed to fetch bank codes: ${err.message}`);
      throw new InternalServerErrorException(
        `Failed to fetch bank codes from Korapay: ${err.response?.data?.message || err.message}`,
      );
    }
  }
}