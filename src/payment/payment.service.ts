/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';
import { randomBytes } from 'crypto';
import { generateVerificationCode } from 'src/common/utils/qrCode.utils';
import {
  PaymentDTO,
  PayinResponse,
  validateDTO,
  generateReference,
  VerifyResponse,
} from './dto/initiate.dto';
import { IPayinProvider } from './interface/payin-provider.interface';
import { KoraPayinProvider } from './providers/kora.provider';
import { AggregatorPayinProvider } from './providers/aggregator.provider';
import { TransactionStatus } from '@prisma/client';

enum TransactionType {
  PURCHASE = 'PURCHASE',
  RESALE = 'RESALE',
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly providers: Map<string, IPayinProvider> = new Map();

  constructor(
    private httpService: HttpService,
    private prisma: PrismaService,
    private mailService: MailService,
    private koraProvider: KoraPayinProvider,
    private aggregatorProvider: AggregatorPayinProvider,
  ) {
    this.providers.set('kora', this.koraProvider);
    this.providers.set('aggregator', this.aggregatorProvider);
  }

  async initiatePayin(dto: PaymentDTO): Promise<PayinResponse> {
    if (!dto.reference) {
      dto.reference = generateReference();
    }
    validateDTO(dto);

    const selectedProvider = process.env.GATEWAY?.toLowerCase() || 'aggregator';
    const providerInstance = this.providers.get(selectedProvider);
    if (!providerInstance) {
      this.logger.error(`Unsupported provider: ${selectedProvider}`);
      throw new BadRequestException(
        `Unsupported provider: ${selectedProvider}`,
      );
    }

    this.logger.log(
      `Routing payin initiation to provider: ${selectedProvider}`,
    );
    try {
      return await providerInstance.initiatePayin(dto);
    } catch (err) {
      this.logger.error(`Failed to initiate payin: ${err.message}`);
      throw new InternalServerErrorException(
        `Failed to initiate payin: ${err.message}`,
      );
    }
  }

  private sanitizeForCacheTag(value: string): string {
    return value.replace(/[^a-zA-Z0-9]/g, '_');
  }

  private async callPaymentGateway<T>(
    method: 'get' | 'post',
    url: string,
    data?: any,
  ): Promise<T> {
    if (!process.env.PAYMENT_GATEWAY_TEST_SECRET) {
      this.logger.error('Payment secret key is missing in environment');
      throw new InternalServerErrorException(
        'Payment gateway secret is not configured',
      );
    }
    if (!process.env.PAYMENT_GATEWAY_URL) {
      this.logger.error('Payment base URL is missing in environment');
      throw new InternalServerErrorException(
        'Payment gateway URL is not configured',
      );
    }

    const headers = {
      Authorization: `Bearer ${process.env.PAYMENT_GATEWAY_TEST_SECRET}`,
      'Content-Type': 'application/json',
    };

    this.logger.log(`📤 Outgoing request → ${method.toUpperCase()} ${url}`);
    try {
      const response = await this.httpService
        .request<T>({
          method,
          url,
          data,
          headers,
        })
        .toPromise();

      if (!response) {
        this.logger.error('No response received from payment gateway');
        throw new InternalServerErrorException(
          'No response from payment gateway',
        );
      }
      this.logger.log(`✅ Payment gateway response status: ${response.status}`);
      return response.data;
    } catch (err) {
      this.logger.error(`Payment gateway error: ${err.message}`);
      throw new InternalServerErrorException(
        `Payment gateway request failed: ${err.message}`,
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async findAndLockTransaction(
    reference: string,
    status: TransactionStatus,
  ) {
    if (!reference) {
      this.logger.error('Transaction reference is undefined');
      throw new BadRequestException('Transaction reference is required');
    }

    const sanitizedReference = this.sanitizeForCacheTag(reference);
    return this.prisma.$transaction(async (tx) => {
      const txn = await tx.transaction.findUnique({
        where: { reference },
        select: {
          reference: true,
          userId: true,
          eventId: true,
          amount: true,
          type: true,
          status: true,
          tickets: {
            select: { ticket: { select: { id: true } } },
          },
          event: {
            select: {
              id: true,
              name: true,
              organizerId: true,
              primaryFeeBps: true,
            },
          },
          user: { select: { id: true, email: true, name: true } },
        },
        cacheStrategy: {
          ttl: 60,
          swr: 30,
          tags: [`transaction_${sanitizedReference}`],
        },
      });
      if (!txn) throw new NotFoundException('Transaction not found');

      if (txn.status === status) {
        return { alreadyProcessed: true, txn };
      }

      await tx.transaction.update({
        where: { reference },
        data: { status },
      });

      await this.invalidateTransactionCache(reference);
      return { alreadyProcessed: false, txn };
    });
  }

  private async updateTicketCategoryMintedCount(
    ticketCategoryId: string,
    ticketCount: number,
  ) {
    await this.prisma.ticketCategory.update({
      where: { id: ticketCategoryId },
      data: { minted: { increment: ticketCount } },
    });
    await this.invalidateTicketCategoryCache(ticketCategoryId);
  }

  private async updateWalletBalance(userId: string, amount: number) {
    await this.prisma.wallet.update({
      where: { userId },
      data: { balance: { increment: amount } },
      select: { userId: true, balance: true },
    });
    await this.invalidateWalletCache(userId);
  }

  private async upsertPlatformAdminWallet(adminId: string, amount: number) {
    await this.prisma.wallet.upsert({
      where: { userId: adminId },
      create: { userId: adminId, balance: amount },
      update: { balance: { increment: amount } },
      select: { userId: true, balance: true },
    });
    await this.invalidateWalletCache(adminId);
  }

  private async createTicketsForPurchase(
    txn: any,
    ticketCategoryId: string,
    ticketCount: number,
  ): Promise<string[]> {
    const ticketIds: string[] = [];
    for (let i = 0; i < ticketCount; i++) {
      const ticket = await this.prisma.ticket.create({
        data: {
          userId: txn.userId,
          eventId: txn.eventId,
          ticketCategoryId,
          code: await this.generateUniqueTicketCode(),
        },
        select: { id: true },
      });
      ticketIds.push(ticket.id);
    }
    await this.invalidateTicketCache(ticketIds, txn.eventId, txn.userId);
    return ticketIds;
  }

  private async linkTicketsToTransaction(
    reference: string,
    ticketIds: string[],
  ) {
    await this.prisma.transaction.update({
      where: { reference },
      data: {
        tickets: {
          create: ticketIds.map((id) => ({ ticket: { connect: { id } } })),
        },
      },
    });
    await this.invalidateTransactionCache(reference);
  }

  private async invalidateTransactionCache(reference: string) {
    const sanitizedReference = this.sanitizeForCacheTag(reference);
    const tags = [`transaction_${sanitizedReference}`];
    this.logger.debug(`Invalidating cache tags: ${tags.join(', ')}`);
    try {
      await this.prisma.$accelerate.invalidate({ tags });
    } catch (e) {
      this.logger.error(
        `Cache invalidation failed for transaction ${reference}: ${e.message}`,
      );
    }
  }

  private async invalidateTicketCategoryCache(ticketCategoryId: string) {
    const sanitizedTicketCategoryId =
      this.sanitizeForCacheTag(ticketCategoryId);
    const tags = [`ticket_category_${sanitizedTicketCategoryId}`];
    this.logger.debug(`Invalidating cache tags: ${tags.join(', ')}`);
    try {
      await this.prisma.$accelerate.invalidate({ tags });
    } catch (e) {
      this.logger.error(
        `Cache invalidation failed for ticket category ${ticketCategoryId}: ${e.message}`,
      );
    }
  }

  private async invalidateWalletCache(userId: string) {
    const sanitizedUserId = this.sanitizeForCacheTag(userId);
    const tags = [`wallet_${sanitizedUserId}`];
    this.logger.debug(`Invalidating cache tags: ${tags.join(', ')}`);
    try {
      await this.prisma.$accelerate.invalidate({ tags });
    } catch (e) {
      this.logger.error(
        `Cache invalidation failed for wallet ${userId}: ${e.message}`,
      );
    }
  }

  private async invalidateTicketCache(
    ticketIds: string[],
    eventId: string,
    userId: string,
  ) {
    const sanitizedTicketIds = ticketIds.map((id) =>
      this.sanitizeForCacheTag(id),
    );
    const sanitizedEventId = this.sanitizeForCacheTag(eventId);
    const sanitizedUserId = this.sanitizeForCacheTag(userId);
    const tags = [
      ...sanitizedTicketIds.map((id) => `ticket_${id}`),
      `resale_tickets_${sanitizedEventId}`,
      `user_tickets_${sanitizedUserId}`,
      'tickets',
    ];
    this.logger.debug(`Invalidating cache tags: ${tags.join(', ')}`);
    try {
      await this.prisma.$accelerate.invalidate({ tags });
    } catch (e) {
      this.logger.error(
        `Cache invalidation failed for tickets ${ticketIds.join(', ')}: ${e.message}`,
      );
    }
  }

  private generateTicketDetails(
    tickets: any[],
    eventId: string,
    userId: string,
  ) {
    return tickets.map((ticket) => {
      if (!ticket.code) {
        throw new BadRequestException(`Ticket ${ticket.id} missing code`);
      }
      return {
        ticketId: ticket.id,
        code: ticket.code,
        categoryName: ticket.ticketCategory?.name || 'Unknown',
        qrData: {
          ticketId: ticket.id,
          eventId,
          userId,
          code: ticket.code,
          verificationCode: generateVerificationCode(
            ticket.code,
            eventId,
            userId,
          ),
          timestamp: Date.now(),
        },
      };
    });
  }

  async sendPurchaseEmails(
    txn: any,
    ticketDetails: any[],
    platformCut: number,
  ) {
    try {
      const platformAdmin = await this.prisma.user.findUnique({
        where: { email: process.env.ADMIN_EMAIL },
        select: { id: true, email: true, name: true },
        cacheStrategy: {
          ttl: 300,
          swr: 60,
          tags: [
            `user_${this.sanitizeForCacheTag(process.env.ADMIN_EMAIL || '')}`,
          ],
        },
      });

      await Promise.all([
        this.mailService.sendTicketPurchaseBuyerMail(
          txn.user.email,
          txn.user.name,
          txn.event.name,
          ticketDetails,
        ),
        this.mailService.sendTicketPurchaseOrganizerMail(
          txn.event.organizer.email,
          txn.event.organizer.name,
          txn.event.name,
          ticketDetails.length,
          txn.amount - platformCut,
          ticketDetails.map((td) => td.categoryName),
        ),
        platformAdmin &&
          this.mailService.sendTicketPurchaseAdminMail(
            platformAdmin.email,
            platformAdmin.name,
            txn.event.name,
            ticketDetails.length,
            platformCut,
            txn.user.name,
            ticketDetails.map((td) => td.categoryName),
          ),
      ]);
    } catch (err) {
      this.logger.error(`Failed to send purchase emails: ${err.message}`);
    }
  }

  private async processPurchaseFlow(txn: any, ticketIds: string[]) {
    if (!txn.eventId || !txn.event) {
      throw new NotFoundException(
        'Event data missing for purchase transaction',
      );
    }

    if (!ticketIds.length) {
      throw new BadRequestException('No ticket IDs provided for transaction');
    }

    const tickets = await this.prisma.ticket.findMany({
      where: { id: { in: ticketIds } },
      select: {
        id: true,
        code: true,
        ticketCategoryId: true,
        ticketCategory: { select: { name: true } },
      },
      cacheStrategy: {
        ttl: 60,
        swr: 30,
        tags: ticketIds
          .map((id) => `ticket_${this.sanitizeForCacheTag(id)}`)
          .concat(['tickets']),
      },
    });

    if (tickets.length !== ticketIds.length) {
      throw new NotFoundException('One or more tickets not found');
    }

    const ticketsByCategory = tickets.reduce(
      (acc, t) => {
        if (t.ticketCategoryId == null) {
          throw new BadRequestException(
            `Ticket ${t.id} missing ticketCategoryId`,
          );
        }
        if (!acc[t.ticketCategoryId]) acc[t.ticketCategoryId] = [];
        acc[t.ticketCategoryId].push(t);
        return acc;
      },
      {} as Record<string, any[]>,
    );

    try {
      for (const [categoryId, ticketsInCat] of Object.entries(
        ticketsByCategory,
      )) {
        const ticketCategory = await this.prisma.ticketCategory.findUnique({
          where: { id: categoryId },
          select: { id: true, name: true, minted: true, maxTickets: true },
          cacheStrategy: {
            ttl: 60,
            swr: 30,
            tags: [`ticket_category_${this.sanitizeForCacheTag(categoryId)}`],
          },
        });
        if (!ticketCategory) {
          throw new NotFoundException(
            `Ticket category ${categoryId} not found`,
          );
        }

        await this.updateTicketCategoryMintedCount(
          categoryId,
          ticketsInCat.length,
        );
      }

      const platformCut = Math.floor(
        (txn.amount * txn.event.primaryFeeBps) / 10000,
      );
      const organizerProceeds = txn.amount - platformCut;

      await this.updateWalletBalance(txn.event.organizerId, organizerProceeds);

      const platformAdmin = await this.prisma.user.findUnique({
        where: { email: process.env.ADMIN_EMAIL },
        select: { id: true, email: true, name: true },
        cacheStrategy: {
          ttl: 300,
          swr: 60,
          tags: [
            `user_${this.sanitizeForCacheTag(process.env.ADMIN_EMAIL || '')}`,
          ],
        },
      });
      if (platformAdmin) {
        await this.upsertPlatformAdminWallet(platformAdmin.id, platformCut);
      }

      await this.sendPurchaseEmails(
        txn,
        this.generateTicketDetails(tickets, txn.eventId, txn.userId),
        platformCut,
      );
      await this.invalidateTicketCache(ticketIds, txn.eventId, txn.userId);
    } catch (err) {
      this.logger.error(
        `Failed to process purchase flow for transaction ${txn.reference}: ${err.message}`,
      );
      throw err;
    }

    return ticketIds;
  }

  private async sendResaleEmails(
    txn: any,
    tickets: any[],
    platformCut: number,
    organizerRoyalty: number,
    sellerProceeds: number,
  ) {
    try {
      const platformAdmin = await this.prisma.user.findUnique({
        where: { email: process.env.ADMIN_EMAIL },
        select: { id: true, email: true, name: true },
        cacheStrategy: {
          ttl: 300,
          swr: 60,
          tags: [
            `user_${this.sanitizeForCacheTag(process.env.ADMIN_EMAIL || '')}`,
          ],
        },
      });
      const organizer = await this.prisma.user.findUnique({
        where: { id: tickets[0].event.organizerId },
        select: { id: true, email: true, name: true },
        cacheStrategy: {
          ttl: 300,
          swr: 60,
          tags: [
            `user_${this.sanitizeForCacheTag(tickets[0].event.organizerId)}`,
          ],
        },
      });
      const seller = tickets[0].user;

      await Promise.all([
        this.mailService.sendTicketResaleBuyerMail(
          txn.user.email,
          txn.user.name,
          tickets[0].event.name,
          this.generateTicketDetails(tickets, tickets[0].event.id, txn.userId),
        ),
        this.mailService.sendTicketResaleSellerMail(
          seller.email,
          seller.name,
          tickets[0].event.name,
          tickets.length,
          sellerProceeds,
          tickets.map((t) => t.ticketCategory?.name || 'Unknown'),
        ),
        organizer &&
          this.mailService.sendTicketResaleOrganizerMail(
            organizer.email,
            organizer.name,
            tickets[0].event.name,
            tickets.length,
            organizerRoyalty,
            tickets.map((t) => t.ticketCategory?.name || 'Unknown'),
          ),
        platformAdmin &&
          this.mailService.sendTicketResaleAdminMail(
            platformAdmin.email,
            platformAdmin.name,
            tickets[0].event.name,
            tickets.length,
            platformCut,
            txn.user.name,
            seller.name,
            tickets.map((t) => t.ticketCategory?.name || 'Unknown'),
          ),
      ]);
    } catch (err) {
      this.logger.error(`Failed to send resale emails: ${err.message}`);
    }
  }

  private async processResaleFlow(txn: any, ticketIds: string[]) {
    if (!ticketIds.length) {
      throw new BadRequestException(
        'No ticket IDs found for resale transaction',
      );
    }

    const tickets = await this.prisma.ticket.findMany({
      where: { id: { in: ticketIds } },
      select: {
        id: true,
        code: true,
        userId: true,
        eventId: true,
        resalePrice: true,
        accountNumber: true,
        bankCode: true,
        event: {
          select: {
            id: true,
            name: true,
            organizerId: true,
            resaleFeeBps: true,
            royaltyFeeBps: true,
          },
        },
        user: { select: { id: true, email: true, name: true } },
        ticketCategory: { select: { name: true } },
      },
      cacheStrategy: {
        ttl: 60,
        swr: 30,
        tags: ticketIds
          .map((id) => `ticket_${this.sanitizeForCacheTag(id)}`)
          .concat(['tickets']),
      },
    });
    if (tickets.length !== ticketIds.length) {
      throw new NotFoundException('One or more tickets not found');
    }

    const event = tickets[0].event;
    if (!event) throw new NotFoundException('Event not found');

    let totalPlatformCut = 0;
    let totalOrganizerRoyalty = 0;
    let totalSellerProceeds = 0;

    try {
      for (const ticket of tickets) {
        const seller = ticket.user;
        if (!seller) {
          throw new NotFoundException(
            `Seller not found for ticket ${ticket.id}`,
          );
        }

        if (!ticket.resalePrice || !ticket.accountNumber || !ticket.bankCode) {
          throw new BadRequestException(
            `Ticket ${ticket.id} is missing resale price or payout info`,
          );
        }

        const platformCut = Math.floor(
          (ticket.resalePrice * event.resaleFeeBps) / 10000,
        );
        const organizerRoyalty = Math.floor(
          (ticket.resalePrice * event.royaltyFeeBps) / 10000,
        );
        const sellerProceeds =
          ticket.resalePrice - (platformCut + organizerRoyalty);

        totalPlatformCut += platformCut;
        totalOrganizerRoyalty += organizerRoyalty;
        totalSellerProceeds += sellerProceeds;

        const newCode = await this.generateUniqueTicketCode();
        await this.prisma.ticket.update({
          where: { id: ticket.id },
          data: {
            userId: txn.userId,
            isListed: false,
            code: newCode,
            resalePrice: null,
            resaleCount: { increment: 1 },
            resaleCommission: platformCut + organizerRoyalty,
            soldTo: txn.userId,
          },
        });

        await this.initiateWithdrawal({
          customer: { email: seller.email, name: seller.name },
          amount: sellerProceeds,
          currency: 'NGN',
          destination: {
            account_number:
              process.env.TEST_BANK_ACCOUNT || ticket.accountNumber,
            bank_code: process.env.TEST_BANK_CODE || ticket.bankCode,
          },
          reference: `resale_payout_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          notification_url: process.env.NOTIFICATION_URL,
          narration: `Resale payout for ticket ${ticket.id}`,
          metadata: { userId: ticket.userId },
        });
      }

      await this.updateWalletBalance(event.organizerId, totalOrganizerRoyalty);

      const platformAdmin = await this.prisma.user.findUnique({
        where: { email: process.env.ADMIN_EMAIL },
        select: { id: true, email: true, name: true },
        cacheStrategy: {
          ttl: 300,
          swr: 60,
          tags: [
            `user_${this.sanitizeForCacheTag(process.env.ADMIN_EMAIL || '')}`,
          ],
        },
      });
      if (platformAdmin) {
        await this.upsertPlatformAdminWallet(
          platformAdmin.id,
          totalPlatformCut,
        );
      }

      await this.sendResaleEmails(
        txn,
        tickets,
        totalPlatformCut,
        totalOrganizerRoyalty,
        totalSellerProceeds,
      );

      await this.invalidateTicketCache(ticketIds, event.id, txn.userId);
    } catch (err) {
      this.logger.error(
        `Failed to process resale flow for transaction ${txn.reference}: ${err.message}`,
      );
      throw err;
    }

    return ticketIds;
  }

  async initiateWithdrawal(data: any): Promise<any> {
    this.logger.log(
      `Initiating withdrawal for userId: ${data.metadata?.userId}`,
    );
    try {
      const response = await this.callPaymentGateway(
        'post',
        `${process.env.PAYMENT_GATEWAY_URL}/api/v1/payout`,
        data,
      );
      return response ?? null;
    } catch (err) {
      this.logger.error(`Failed to initiate withdrawal: ${err.message}`);
      throw new InternalServerErrorException(
        `Withdrawal failed: ${err.message}`,
      );
    }
  }

  async fetchBankCodes() {
    try {
      const response = await this.httpService.axiosRef.get(
        process.env.BANK_CODES_URL!,
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch bank codes: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch bank codes');
    }
  }

  async verifyTransaction(
    reference: string,
    provider?: string,
    koraPayload?: any, // <-- optional raw payload when provider is Kora
  ) {
    if (!reference) {
      this.logger.error('Verification failed: Reference is undefined');
      throw new BadRequestException('Transaction reference is required');
    }

    this.logger.log(`🔍 Starting verification for reference: ${reference}`);

    const providerKey =
      provider || process.env.GATEWAY?.toLowerCase() || 'kora';
    const verifyProvider = this.providers.get(providerKey);

    let response: VerifyResponse;

    if (providerKey === 'kora') {
      // ✅ Kora webhook is only fired on charge.success
      this.logger.log(
        `⚡ Skipping API verification for Kora, using webhook payload directly`,
      );

      if (!koraPayload?.data) {
        throw new BadRequestException('Missing Kora payload for verification');
      }

      response = {
        status: true,
        message: 'Kora webhook received',
        data: {
          reference: koraPayload.data.reference,
          status: koraPayload.data.status, // "success"
          amount: koraPayload.data.amount,
          currency: koraPayload.data.currency,
          paymentMethod: koraPayload.data.payment_method,
          fee: koraPayload.data.fee,
        },
      };
    } else {
      // ✅ Aggregators still need explicit verify call
      if (!verifyProvider) {
        this.logger.error(`Unknown payment provider: ${providerKey}`);
        throw new BadRequestException(
          `Unknown payment provider: ${providerKey}`,
        );
      }

      try {
        response = await verifyProvider.verifyTransaction(reference);
        this.logger.log(
          `✅ Gateway response: status=${response.status}, message=${response.message}`,
        );
      } catch (err) {
        this.logger.error(
          `Verification failed for ${reference}: ${err.message}`,
        );
        throw new InternalServerErrorException(
          `Failed to verify transaction: ${err.message}`,
        );
      }
    }

    // --- Map provider status → internal enum
    const providerStatus = response.data?.status?.toLowerCase();
    let txnStatus: TransactionStatus;

    switch (providerStatus) {
      case 'success':
        txnStatus = TransactionStatus.SUCCESS;
        break;
      case 'failed':
        txnStatus = TransactionStatus.FAILED;
        break;
      case 'pending':
      default:
        txnStatus = TransactionStatus.PENDING;
        break;
    }

    this.logger.log(
      `📌 Provider status for ${reference}: ${providerStatus} → ${txnStatus}`,
    );

    // --- Update local DB record
    const { alreadyProcessed, txn } = await this.findAndLockTransaction(
      reference,
      txnStatus,
    );

    this.logger.log(
      `🔐 Transaction status: alreadyProcessed=${alreadyProcessed}`,
    );

    if (alreadyProcessed) {
      return { message: 'Already verified', success: true };
    }

    // --- Only process tickets if SUCCESS
    if (txnStatus !== TransactionStatus.SUCCESS) {
      this.logger.warn(
        `Skipping ticket processing for ${reference}, status is ${txnStatus}`,
      );
      return {
        message: `Transaction updated with status ${txnStatus}`,
        success: false,
      };
    }

    const ticketIds = txn.tickets
      .filter((tt) => tt.ticket?.id)
      .map((tt) => tt.ticket.id);

    this.logger.log(`🎟️ Tickets linked: ${ticketIds.join(', ')}`);

    try {
      if (txn.type === TransactionType.PURCHASE) {
        this.logger.log(`🛒 Processing purchase for ${reference}`);
        await this.processPurchaseFlow(txn, ticketIds);
      } else if (txn.type === TransactionType.RESALE) {
        this.logger.log(`♻️ Processing resale for ${reference}`);
        await this.processResaleFlow(txn, ticketIds);
      } else {
        this.logger.error(`Invalid transaction type: ${txn.type}`);
        throw new BadRequestException(`Invalid transaction type: ${txn.type}`);
      }

      this.logger.log(`🎉 Transaction ${reference} processed successfully`);
      return {
        message: 'Transaction verified and processed successfully',
        ticketIds,
        success: true,
      };
    } catch (err) {
      this.logger.error(`Failed to process ${reference}: ${err.message}`);
      throw err;
    }
  }

  private generateTicketCode(): string {
    const randomPart = randomBytes(5).toString('hex').toUpperCase();
    return `TCK-${randomPart}`;
  }

  async generateUniqueTicketCode(): Promise<string> {
    let code: string;
    let exists = true;

    do {
      code = this.generateTicketCode();
      exists = !!(await this.prisma.ticket.findUnique({ where: { code } }));
    } while (exists);

    return code;
  }
}
