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

  constructor(private httpService: HttpService) {
    this.baseUrl = process.env.KORA_API_URL || '';
    this.secretKey = process.env.KORA_API_TEST_SECRET || '';
    if (!this.baseUrl || !this.secretKey) {
      throw new Error('Korapay configuration is missing');
    }
  }

  async initiatePayin(dto: PaymentDTO): Promise<PayinResponse> {
    const payload = {
      amount: dto.amount,
      currency: dto.currency,
      reference: dto.reference,
      customer: dto.customer,
      redirect_url: dto.redirectUrl,
      notification_url: dto.notificationUrl,
      narration: dto.narration,
      channels: ['card', 'bank_transfer', 'pay_with_bank'],
      default_channel: 'bank_transfer',
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
        this.logger.error(
          'Korapay initiation failed: Invalid response structure',
        );
        throw new InternalServerErrorException(
          'Failed to initiate payin with Korapay: Invalid response structure',
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
      throw new InternalServerErrorException(
        'Failed to initiate payin with Korapay',
      );
    }
  }
}
