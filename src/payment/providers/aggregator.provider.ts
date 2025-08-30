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

  async initiatePayin(dto: PaymentDTO): Promise<PayinResponse> {
    const payload = {
      amount: dto.amount,
      currency: dto.currency,
      reference: dto.reference,
      customer: dto.customer,
      redirect_url: dto.redirectUrl,
      notification_url: dto.notificationUrl,
      narration: dto.narration,
      metadata: sanitizeMetadata(dto.metadata),
    };

    this.logger.log(
      `Initiating Aggregator payin with payload: ${JSON.stringify(payload)}`,
    );

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
          reference: dto.reference,
          checkoutUrl: resData.checkout_url,
        },
      };
    } catch (err) {
      this.logger.error(`Aggregator initiation failed: ${err.message}`);
      throw new InternalServerErrorException(
        'Failed to initiate payin with Aggregator',
      );
    }
  }
}
