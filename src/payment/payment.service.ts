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
import { InitiateDto } from './dto/initiate.dto';
import { randomBytes } from 'crypto';
import { generateVerificationCode } from 'src/common/utils/qrCode.utils';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly paymentBaseUrl = process.env.PAYMENT_GATEWAY_URL;
  private readonly paymentSecretKey = process.env.PAYMENT_GATEWAY_TEST_SECRET;

  constructor(
    private httpService: HttpService,
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  // Private Helpers
  private sanitizeForCacheTag(value: string): string {
    return value.replace(/[^a-zA-Z0-9]/g, '_');
  }

  private async callPaymentGateway<T>(
    method: 'get' | 'post',
    url: string,
    data?: any,
  ): Promise<T> {
    const headers = {
      Authorization: `Bearer ${this.paymentSecretKey}`,
      'Content-Type': 'application/json',
    };

    this.logger.log(`📤 Outgoing request → ${method.toUpperCase()} ${url}`);
    this.logger.log(
      `📦 Request body: ${data ? JSON.stringify(data, null, 2) : 'N/A'}`,
    );
    this.logger.log(`🪪 Request headers: ${JSON.stringify(headers, null, 2)}`);

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
        this.logger.error('❌ No response received from payment gateway');
        throw new InternalServerErrorException(
          'No response from payment gateway',
        );
      }
      this.logger.log(`✅ Payment gateway response status: ${response.status}`);
      this.logger.log(
        `✅ Response data: ${JSON.stringify(response.data, null, 2)}`,
      );

      return response.data;
    } catch (err) {
      this.logger.error(`❌ Payment gateway error: ${err.message}`);
      this.logger.error(`❌ Status code: ${err?.response?.status || 'N/A'}`);
      this.logger.error(
        `❌ Raw response: ${JSON.stringify(err?.response?.data, null, 2)}`,
      );
      throw new InternalServerErrorException('Payment gateway request failed');
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async findAndLockTransaction(reference: string) {
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
          event: {
            select: {
              id: true,
              name: true,
              organizerId: true,
              primaryFeeBps: true,
              resaleFeeBps: true,
              royaltyFeeBps: true,
              ticketCategories: true,
            },
          },
          tickets: {
            select: {
              ticket: {
                select: {
                  id: true,
                  ticketCategoryId: true,
                  code: true,
                  userId: true,
                  ticketCategory: true,
                },
              },
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

      if (txn.status === 'SUCCESS') {
        return { alreadyProcessed: true, txn };
      }

      await tx.transaction.update({
        where: { reference },
        data: { status: 'SUCCESS' },
      });

      // Invalidate transaction cache after status update
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
    // Invalidate ticket category cache
    await this.invalidateTicketCategoryCache(ticketCategoryId);
  }

  private async updateWalletBalance(userId: string, amount: number) {
    await this.prisma.wallet.update({
      where: { userId },
      data: { balance: { increment: amount } },
      select: { userId: true, balance: true },
    });
    // Invalidate wallet cache
    await this.invalidateWalletCache(userId);
  }

  private async upsertPlatformAdminWallet(adminId: string, amount: number) {
    await this.prisma.wallet.upsert({
      where: { userId: adminId },
      create: { userId: adminId, balance: amount },
      update: { balance: { increment: amount } },
      select: { userId: true, balance: true },
    });
    // Invalidate admin wallet cache
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
    // Invalidate user ticket cache
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
    // Invalidate transaction cache
    await this.invalidateTransactionCache(reference);
  }

  private async invalidateTransactionCache(reference: string) {
    const sanitizedReference = this.sanitizeForCacheTag(reference);
    const tags = [`transaction_${sanitizedReference}`];
    this.logger.debug(`Invalidating cache tags: ${JSON.stringify(tags)}`);
    try {
      await this.prisma.$accelerate.invalidate({ tags });
    } catch (e) {
      this.logger.error(
        `Cache invalidation failed for transaction ${reference}: ${e.message}`,
        e.stack,
      );
      // Do not rethrow; allow transaction to proceed
    }
  }

  private async invalidateTicketCategoryCache(ticketCategoryId: string) {
    const sanitizedTicketCategoryId =
      this.sanitizeForCacheTag(ticketCategoryId);
    const tags = [`ticket_category_${sanitizedTicketCategoryId}`];
    this.logger.debug(`Invalidating cache tags: ${JSON.stringify(tags)}`);
    try {
      await this.prisma.$accelerate.invalidate({ tags });
    } catch (e) {
      this.logger.error(
        `Cache invalidation failed for ticket category ${ticketCategoryId}: ${e.message}`,
        e.stack,
      );
      // Do not rethrow; allow transaction to proceed
    }
  }

  private async invalidateWalletCache(userId: string) {
    const sanitizedUserId = this.sanitizeForCacheTag(userId);
    const tags = [`wallet_${sanitizedUserId}`];
    this.logger.debug(`Invalidating cache tags: ${JSON.stringify(tags)}`);
    try {
      await this.prisma.$accelerate.invalidate({ tags });
    } catch (e) {
      this.logger.error(
        `Cache invalidation failed for wallet ${userId}: ${e.message}`,
        e.stack,
      );
      // Do not rethrow; allow transaction to proceed
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
    this.logger.debug(`Invalidating cache tags: ${JSON.stringify(tags)}`);
    try {
      await this.prisma.$accelerate.invalidate({ tags });
    } catch (e) {
      this.logger.error(
        `Cache invalidation failed for tickets ${ticketIds.join(', ')}: ${e.message}`,
        e.stack,
      );
      // Do not rethrow; allow transaction to proceed
    }
  }

  private generateTicketDetails(
    tickets: any[],
    eventId: string,
    userId: string,
  ) {
    const ticketDetails = tickets.map((ticket) => {
      if (!ticket.code)
        throw new BadRequestException(`Ticket ${ticket.id} missing code`);
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

    return ticketDetails;
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
      this.logger.error(`Failed to send purchase emails`, err.stack);
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

    // Group tickets by category
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

      // Invalidate ticket caches
      await this.invalidateTicketCache(ticketIds, txn.eventId, txn.userId);
    } catch (err) {
      this.logger.error(
        `Failed to process purchase flow for transaction ${txn.reference}: ${err.message}`,
        err.stack,
      );
      throw err; // Rethrow to trigger transaction rollback in verifyTransaction
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
      this.logger.error(`Failed to send resale emails`, err.stack);
    }
  }

  private async processResaleFlow(txn: any, ticketIds: string[]) {
    if (!ticketIds.length)
      throw new BadRequestException(
        'No ticket IDs found for resale transaction',
      );

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
    if (tickets.length !== ticketIds.length)
      throw new NotFoundException('One or more tickets not found');

    const event = tickets[0].event;
    if (!event) throw new NotFoundException('Event not found');

    let totalPlatformCut = 0;
    let totalOrganizerRoyalty = 0;
    let totalSellerProceeds = 0;

    try {
      for (const ticket of tickets) {
        const seller = ticket.user;
        if (!seller)
          throw new NotFoundException(
            `Seller not found for ticket ${ticket.id}`,
          );

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

      // Invalidate ticket caches
      await this.invalidateTicketCache(ticketIds, event.id, txn.userId);
    } catch (err) {
      this.logger.error(
        `Failed to process resale flow for transaction ${txn.reference}: ${err.message}`,
        err.stack,
      );
      throw err; // Rethrow to trigger transaction rollback in verifyTransaction
    }

    return ticketIds;
  }

  // Payment Initiation
  async initiatePayment(data: InitiateDto): Promise<string> {
    this.logger.log(
      `💡 Sending payment initiation request to gateway:\n${JSON.stringify(data, null, 2)}`,
    );

    let response;
    try {
      response = await this.callPaymentGateway<{ checkout_url?: string }>(
        'post',
        `${this.paymentBaseUrl}/api/v1/initiate`,
        data,
      );
    } catch (error) {
      this.logger.error(
        `❌ Payment gateway request failed:\n${JSON.stringify(error.response?.data, null, 2)}\n${error.stack}`,
      );
      throw new InternalServerErrorException(
        error?.response?.data?.message || 'Payment gateway request failed',
      );
    }

    this.logger.log(
      `💳 Payment gateway response:\n${JSON.stringify(response, null, 2)}`,
    );

    if (!response.checkout_url) {
      this.logger.error('❌ Payment gateway did not return a checkout_url');
      throw new BadRequestException('Failed to initiate payment');
    }

    return response.checkout_url;
  }

  async initiateWithdrawal(data: any): Promise<any> {
    this.logger.log(
      `Initiating withdrawal with data: ${JSON.stringify(data, null, 2)}`,
    );
    const response = await this.callPaymentGateway(
      'post',
      `${this.paymentBaseUrl}/api/v1/payout`,
      data,
    );
    return response ?? null;
  }

  // Fetch bank codes
  async fetchBankCodes() {
    try {
      const response = await this.httpService.axiosRef.get(
        process.env.BANK_CODES_URL!,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `❌ Failed to fetch bank codes: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to fetch bank codes');
    }
  }

  // Transaction Verification
  async verifyTransaction(reference: string) {
    this.logger.log(`🔍 Starting verification for reference: ${reference}`);

    const verifyUrl = `${this.paymentBaseUrl}/api/v1/transactions/verify?reference=${reference}`;

    this.logger.log(`🌐 Verify URL: ${verifyUrl}`);
    this.logger.log(`🔑 Secret key defined: ${!!this.paymentSecretKey}`);
    if (!this.paymentSecretKey) {
      this.logger.error(`❌ Payment secret key is missing in environment`);
    }
    if (!this.paymentBaseUrl) {
      this.logger.error(`❌ Payment base URL is missing in environment`);
    }

    let response;
    try {
      response = await this.callPaymentGateway<{
        status: boolean;
        message: string;
      }>('get', verifyUrl);

      this.logger.log(
        `✅ Gateway verification response: ${JSON.stringify(response, null, 2)}`,
      );
    } catch (err) {
      this.logger.error(
        `❌ Error calling verify endpoint:\n${err.message}\n${err.stack}`,
      );
      this.logger.error(
        `❌ Raw error response: ${JSON.stringify(err?.response?.data, null, 2)}`,
      );
      throw err;
    }

    const { status, message } = response;
    if (!status || message !== 'verification successful') {
      this.logger.error(
        `❌ Verification failed for reference: ${reference}, Response: ${JSON.stringify(response, null, 2)}`,
      );
      throw new BadRequestException('Transaction verification failed');
    }

    this.logger.log(`✅ Reference ${reference} verified by gateway`);

    const { alreadyProcessed, txn } =
      await this.findAndLockTransaction(reference);
    this.logger.log(
      `🔐 Transaction DB status for ${reference}: alreadyProcessed=${alreadyProcessed}`,
    );

    if (alreadyProcessed) {
      return { message: 'Already verified', success: true };
    }

    const ticketIds = txn.tickets
      .filter((tt) => tt.ticket?.id)
      .map((tt) => tt.ticket.id);

    this.logger.log(
      `🎟️ Tickets linked to transaction ${reference}: ${JSON.stringify(ticketIds)}`,
    );

    try {
      if (txn.type === 'PURCHASE') {
        this.logger.log(`🛒 Processing purchase flow for txn ${reference}`);
        await this.processPurchaseFlow(txn, ticketIds);
      } else if (txn.type === 'RESALE') {
        this.logger.log(`♻️ Processing resale flow for txn ${reference}`);
        await this.processResaleFlow(txn, ticketIds);
      } else {
        this.logger.error(`❌ Invalid transaction type: ${txn.type}`);
        throw new BadRequestException(`Invalid transaction type: ${txn.type}`);
      }

      this.logger.log(
        `🎉 Transaction ${reference} verified and processed successfully`,
      );

      return {
        message: 'Transaction verified and processed successfully',
        ticketIds,
      };
    } catch (err) {
      this.logger.error(
        `Failed to verify transaction ${reference}: ${err.message}`,
        err.stack,
      );
      throw err; // Rethrow to allow caller to handle rollback if needed
    }
  }

  // Ticket Code Generation
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
