/* eslint-disable prettier/prettier */
import {
  Body,
  Controller,
  HttpCode,
  Post,
  Get,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PaymentService } from './payment.service';

@Controller('v1/payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);
  constructor(private readonly paymentService: PaymentService) {}

  @Post('notification')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Webhook for transaction verification',
    description:
      'Endpoint to verify transactions after receiving payment webhook from Korapay or Aggregator.',
  })
  @ApiBody({
    description:
      'Payment processor webhook payload (Korapay: JSON with event and data, Aggregator: reference string)',
    schema: {
      oneOf: [
        {
          type: 'object',
          properties: {
            event: { type: 'string', example: 'charge.success' },
            data: {
              type: 'object',
              properties: {
                reference: {
                  type: 'string',
                  example: 'txn_1720781234567_xyzab',
                },
                currency: { type: 'string', example: 'NGN' },
                amount: { type: 'number', example: 100000 },
                fee: { type: 'number', example: 1075 },
                status: { type: 'string', example: 'success' },
                payment_method: { type: 'string', example: 'bank_transfer' },
              },
              required: ['reference'],
            },
          },
          required: ['event', 'data'],
        },
        {
          type: 'string',
          example: 'txn_1720781234567_xyzab',
        },
      ],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction verified and processed',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        ticketIds: {
          type: 'array',
          items: { type: 'string' },
        },
        success: { type: 'boolean' },
      },
    },
  })
  async verifyWebhook(@Body() payload: any) {
    this.logger.log(
      `Received webhook payload: ${JSON.stringify(payload, null, 2)}`,
    );

    let provider: 'aggregator' | undefined;

    const reference = payload.data.reference;

    if (!reference) {
      this.logger.error('Webhook payload missing reference');
      throw new BadRequestException('Transaction reference is required');
    }

    try {
      const result = await this.paymentService.verifyTransaction(
        reference,
        provider,
        provider === 'aggregator' ? payload : undefined,
      );

      this.logger.log(
        `Webhook processed successfully for reference: ${reference}`,
      );
      return result;
    } catch (err) {
      this.logger.error(
        `Failed to process webhook for reference ${reference}: ${err.message}`,
        err.stack,
      );
      throw err;
    }
  }

  @Get('banks')
  @ApiOperation({
    summary: 'Get bank codes',
    description: 'Fetch list of bank codes from the payment gateway',
  })
  @ApiResponse({
    status: 200,
    description: 'List of banks fetched successfully',
    schema: {
      type: 'array',
      items: { type: 'object' },
    },
  })
  fetchBankCodes() {
    return this.paymentService.fetchBankCodes();
  }
}
