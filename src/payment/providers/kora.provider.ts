import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import {
  PaymentDTO,
  PayinResponse,
  sanitizeMetadata,
} from '../dto/initiate.dto';
import { IPayinProvider } from '../interface/payin-provider.interface';

@Injectable()
export class KoraPayinProvider implements IPayinProvider {
  private readonly logger = new Logger(KoraPayinProvider.name);
  private readonly baseUrl: string;
  private readonly secretKey: string;
  private readonly supportedChannels = [
    'card',
    'bank_transfer',
    'mobile_money',
  ];

  constructor(private httpService: HttpService) {
    this.baseUrl = process.env.KORA_API_URL || '';
    this.secretKey = process.env.KORA_API_TEST_SECRET || '';
    if (!this.baseUrl || !this.secretKey) {
      throw new Error('Korapay configuration is missing');
    }
  }

  async initiatePayin(dto: PaymentDTO): Promise<PayinResponse> {
    // Convert amount to kobo for NGN
    const amount = dto.currency === 'NGN' ? Math.round(dto.amount) : dto.amount;

    // Filter supported channels, use defaults if none provided
    const channels =
      dto.channels?.filter((c) => this.supportedChannels.includes(c)) ||
      this.supportedChannels;
    const defaultChannel =
      dto.defaultChannel && this.supportedChannels.includes(dto.defaultChannel)
        ? dto.defaultChannel
        : 'card';

    const payload = {
      amount,
      currency: dto.currency,
      reference: dto.reference,
      customer: dto.customer,
      redirect_url: dto.redirectUrl,
      notification_url: dto.notificationUrl,
      narration: dto.narration || `Payment for ${dto.reference}`,
      channels: channels.length > 0 ? channels : undefined, // Omit if empty
      default_channel: channels.includes(defaultChannel)
        ? defaultChannel
        : undefined, // Omit if invalid
      metadata: sanitizeMetadata(dto.metadata),
      merchant_bears_cost: dto.merchantBearsCost ?? false,
    };

    this.logger.log(
      `Initiating Korapay payin with payload: ${JSON.stringify(payload)}`,
    );

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
          reference: dto.reference,
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
}
