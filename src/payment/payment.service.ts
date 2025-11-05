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
  WithdrawalDTO,
  WithdrawalResponse,
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

  // ===================== Payment Initiation =====================
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

  // ===================== Transaction Management =====================
  // eslint-disable-next-line @typescript-eslint/require-await
  private async findAndLockTransaction(
    reference: string,
    status: TransactionStatus,
  ) {
    if (!reference) {
      this.logger.error('Transaction reference is undefined');
      throw new BadRequestException('Transaction reference is required');
    }

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
              organizer: {
                select: { id: true, email: true, name: true },
              },
            },
          },
          user: { select: { id: true, email: true, name: true } },
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
  }

  private async updateWalletBalance(userId: string, amount: number) {
    await this.prisma.wallet.update({
      where: { userId },
      data: { balance: { increment: amount } },
      select: { userId: true, balance: true },
    });
  }

  private async updateEventPayoutBalance(
    eventId: string,
    organizerId: string,
    amount: number,
  ) {
    await this.prisma.eventPayout.upsert({
      where: { eventId },
      update: { balance: { increment: amount } },
      create: {
        eventId,
        organizerId,
        balance: amount,
      },
    });
  }

  private async upsertPlatformAdminWallet(adminId: string, amount: number) {
    await this.prisma.wallet.upsert({
      where: { userId: adminId },
      create: { userId: adminId, balance: amount },
      update: { balance: { increment: amount } },
      select: { userId: true, balance: true },
    });
  }

  // ===================== Email and QR Code Helpers =====================
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
      });

      if (!txn.event.organizer) {
        this.logger.error(`Organizer not found for event ${txn.eventId}`);
        throw new NotFoundException(
          `Organizer not found for event ${txn.eventId}`,
        );
      }

      await Promise.all([
        this.mailService.sendTicketPurchaseBuyerMail(
          txn.user.email,
          txn.user.name,
          txn.event.name,
          ticketDetails,
        ),
        this.mailService.sendTicketPurchaseOrganizerMail(
          txn.event.organizer.email,
          txn.event.organizer.name || 'Unknown',
          txn.event.name,
          ticketDetails.length,
          txn.amount - platformCut,
          ticketDetails.map((td) => td.categoryName),
        ),
        platformAdmin &&
          this.mailService.sendTicketPurchaseAdminMail(
            platformAdmin.email,
            platformAdmin.name || 'Admin',
            txn.event.name,
            ticketDetails.length,
            platformCut,
            txn.user.name,
            ticketDetails.map((td) => td.categoryName),
          ),
      ]);
    } catch (err) {
      this.logger.error(`Failed to send purchase emails: ${err.message}`);
      throw new InternalServerErrorException(
        `Failed to send purchase emails: ${err.message}`,
      );
    }
  }

  // ===================== Purchase Flow =====================
  private async validateTicketsForPurchase(txn: any, ticketIds: string[]) {
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
    });

    if (tickets.length !== ticketIds.length) {
      throw new NotFoundException('One or more tickets not found');
    }

    return tickets;
  }

  private async updateTicketCategories(tickets: any[]) {
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

    for (const [categoryId, ticketsInCat] of Object.entries(
      ticketsByCategory,
    )) {
      const ticketCategory = await this.prisma.ticketCategory.findUnique({
        where: { id: categoryId },
        select: { id: true, name: true, minted: true, maxTickets: true },
      });
      if (!ticketCategory) {
        throw new NotFoundException(`Ticket category ${categoryId} not found`);
      }

      const typedTickets = ticketsInCat as any[];
      await this.updateTicketCategoryMintedCount(
        categoryId,
        typedTickets.length,
      );
    }

    return ticketsByCategory;
  }

  private async processPurchaseFinancials(txn: any) {
    const platformCut = Math.floor(
      (txn.amount * txn.event.primaryFeeBps) / 10000,
    );
    const organizerProceeds = txn.amount - platformCut;

    // 🔒 Lock funds in EventPayout instead of Wallet
    await this.updateEventPayoutBalance(
      txn.eventId,
      txn.event.organizerId,
      organizerProceeds,
    );

    // 💰 Platform admin cut still goes directly to admin wallet
    const platformAdmin = await this.prisma.user.findUnique({
      where: { email: process.env.ADMIN_EMAIL },
      select: { id: true, email: true, name: true },
    });
    if (platformAdmin) {
      await this.upsertPlatformAdminWallet(platformAdmin.id, platformCut);
    }

    return platformCut;
  }

  private async processPurchaseFlow(txn: any, ticketIds: string[]) {
    const tickets = await this.validateTicketsForPurchase(txn, ticketIds);
    await this.updateTicketCategories(tickets);
    const platformCut = await this.processPurchaseFinancials(txn);
    await this.sendPurchaseEmails(
      txn,
      this.generateTicketDetails(tickets, txn.eventId, txn.userId),
      platformCut,
    );

    return ticketIds;
  }

  // ===================== Resale Flow =====================
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
      });
      const organizer = await this.prisma.user.findUnique({
        where: { id: tickets[0].event.organizerId },
        select: { id: true, email: true, name: true },
      });
      const seller = tickets[0].user;

      if (!organizer) {
        this.logger.error(
          `Organizer not found for event ${tickets[0].event.id}`,
        );
        throw new NotFoundException(
          `Organizer not found for event ${tickets[0].event.id}`,
        );
      }

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
        this.mailService.sendTicketResaleOrganizerMail(
          organizer.email,
          organizer.name || 'Unknown',
          tickets[0].event.name,
          tickets.length,
          organizerRoyalty,
          tickets.map((t) => t.ticketCategory?.name || 'Unknown'),
        ),
        platformAdmin &&
          this.mailService.sendTicketResaleAdminMail(
            platformAdmin.email,
            platformAdmin.name || 'Admin',
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
      throw new InternalServerErrorException(
        `Failed to send resale emails: ${err.message}`,
      );
    }
  }

  private async validateTicketsForResale(txn: any, ticketIds: string[]) {
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
    });

    if (tickets.length !== ticketIds.length) {
      throw new NotFoundException('One or more tickets not found');
    }

    const event = tickets[0].event;
    if (!event) throw new NotFoundException('Event not found');

    return { tickets, event };
  }

  private async processResaleTicket(
    ticket: any,
    txn: any,
    platformCutAcc: number,
    organizerRoyaltyAcc: number,
    sellerProceedsAcc: number,
  ) {
    const seller = ticket.user;
    if (!seller) {
      throw new NotFoundException(`Seller not found for ticket ${ticket.id}`);
    }

    if (!ticket.resalePrice || !ticket.accountNumber || !ticket.bankCode) {
      throw new BadRequestException(
        `Ticket ${ticket.id} is missing resale price or payout info`,
      );
    }

    const platformCut = Math.floor(
      (ticket.resalePrice * ticket.event.resaleFeeBps) / 10000,
    );
    const organizerRoyalty = Math.floor(
      (ticket.resalePrice * ticket.event.royaltyFeeBps) / 10000,
    );
    const sellerProceeds =
      ticket.resalePrice - (platformCut + organizerRoyalty);

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

    const withdrawalDto: WithdrawalDTO = {
      customer: { email: seller.email, name: seller.name },
      amount: sellerProceeds,
      currency: 'NGN',
      reference: `resale_payout_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      notificationUrl: process.env.NOTIFICATION_URL,
      narration: `Resale payout for ticket ${ticket.id}`,
      metadata: { userId: ticket.userId },
      destination: {
        type: 'bank_account',
        bank_account: {
          bank: process.env.TEST_BANK_CODE || ticket.bankCode,
          account: process.env.TEST_BANK_ACCOUNT || ticket.accountNumber,
          account_name: seller.name || 'Unknown',
        },
      },
    };

    await this.initiateWithdrawal(withdrawalDto);

    return {
      platformCut: platformCutAcc + platformCut,
      organizerRoyalty: organizerRoyaltyAcc + organizerRoyalty,
      sellerProceeds: sellerProceedsAcc + sellerProceeds,
    };
  }

  private async processResaleFinancials(txn: any, tickets: any[]) {
    let totalPlatformCut = 0;
    let totalOrganizerRoyalty = 0;
    let totalSellerProceeds = 0;

    for (const ticket of tickets) {
      const { platformCut, organizerRoyalty, sellerProceeds } =
        await this.processResaleTicket(
          ticket,
          txn,
          totalPlatformCut,
          totalOrganizerRoyalty,
          totalSellerProceeds,
        );
      totalPlatformCut = platformCut;
      totalOrganizerRoyalty = organizerRoyalty;
      totalSellerProceeds = sellerProceeds;
    }

    await this.updateWalletBalance(
      tickets[0].event.organizerId,
      totalOrganizerRoyalty,
    );

    const platformAdmin = await this.prisma.user.findUnique({
      where: { email: process.env.ADMIN_EMAIL },
      select: { id: true, email: true, name: true },
    });
    if (platformAdmin) {
      await this.upsertPlatformAdminWallet(platformAdmin.id, totalPlatformCut);
    }

    return { totalPlatformCut, totalOrganizerRoyalty, totalSellerProceeds };
  }

  private async processResaleFlow(txn: any, ticketIds: string[]) {
    const { tickets } = await this.validateTicketsForResale(txn, ticketIds);
    const { totalPlatformCut, totalOrganizerRoyalty, totalSellerProceeds } =
      await this.processResaleFinancials(txn, tickets);
    await this.sendResaleEmails(
      txn,
      tickets,
      totalPlatformCut,
      totalOrganizerRoyalty,
      totalSellerProceeds,
    );

    return ticketIds;
  }

  // ===================== Withdrawal =====================
  async initiateWithdrawal(dto: WithdrawalDTO): Promise<WithdrawalResponse> {
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
      `Routing withdrawal initiation to provider: ${selectedProvider} for userId: ${dto.metadata?.userId}`,
    );
    try {
      return await providerInstance.initiateWithdrawal(dto);
    } catch (err) {
      this.logger.error(`Failed to initiate withdrawal: ${err.message}`);
      throw new InternalServerErrorException(
        `Withdrawal failed: ${err.message}`,
      );
    }
  }

  // ===================== Bank Codes =====================
  async fetchBankCodes() {
    const selectedProvider = 'aggregator';
    const providerInstance = this.providers.get(selectedProvider);
    if (!providerInstance) {
      this.logger.error(`Unsupported provider: ${selectedProvider}`);
      throw new BadRequestException(
        `Unsupported provider: ${selectedProvider}`,
      );
    }

    this.logger.log(`Fetching bank codes from provider: ${selectedProvider}`);
    try {
      return await providerInstance.fetchBankCodes();
    } catch (err) {
      this.logger.error(`Failed to fetch bank codes: ${err.message}`);
      throw new InternalServerErrorException(
        `Failed to fetch bank codes: ${err.message}`,
      );
    }
  }

  // ===================== Transaction Verification =====================
  // eslint-disable-next-line @typescript-eslint/require-await
  private async verifyKoraTransaction(
    koraPayload: any,
  ): Promise<VerifyResponse> {
    if (!koraPayload?.data) {
      throw new BadRequestException('Missing Kora payload for verification');
    }

    return {
      status: true,
      message: 'Kora webhook received',
      data: {
        reference: koraPayload.data.reference,
        status: koraPayload.data.status,
        amount: koraPayload.data.amount,
        currency: koraPayload.data.currency,
        paymentMethod: koraPayload.data.payment_method,
        fee: koraPayload.data.fee,
      },
    };
  }

  private async verifyAggregatorTransaction(
    reference: string,
    verifyProvider: IPayinProvider,
  ): Promise<VerifyResponse> {
    try {
      const response = await verifyProvider.verifyTransaction(reference);
      this.logger.log(
        `✅ Gateway response: status=${response.status}, message=${response.message}`,
      );
      return response;
    } catch (err) {
      this.logger.error(`Verification failed for ${reference}: ${err.message}`);
      throw new InternalServerErrorException(
        `Failed to verify transaction: ${err.message}`,
      );
    }
  }

  private mapProviderStatusToTransactionStatus(
    providerStatus: string,
  ): TransactionStatus {
    switch (providerStatus?.toLowerCase()) {
      case 'success':
        return TransactionStatus.SUCCESS;
      case 'failed':
        return TransactionStatus.FAILED;
      case 'pending':
      default:
        return TransactionStatus.PENDING;
    }
  }

  async verifyTransaction(
    reference: string,
    provider?: string,
    koraPayload?: any,
  ) {
    if (!reference) {
      this.logger.error('Verification failed: Reference is undefined');
      throw new BadRequestException('Transaction reference is required');
    }

    this.logger.log(`🔍 Starting verification for reference: ${reference}`);

    const providerKey = process.env.GATEWAY?.toLowerCase() || 'aggregator';
    const verifyProvider = this.providers.get(providerKey);

    if (!verifyProvider && providerKey !== 'kora') {
      this.logger.error(`Unknown payment provider: ${providerKey}`);
      throw new BadRequestException(`Unknown payment provider: ${providerKey}`);
    }

    let response: VerifyResponse;
    if (providerKey === 'kora') {
      this.logger.log(
        `⚡ Skipping API verification for Kora, using webhook payload directly`,
      );
      response = await this.verifyKoraTransaction(koraPayload);
    } else {
      response = await this.verifyAggregatorTransaction(
        reference,
        verifyProvider!,
      );
    }

    const txnStatus = this.mapProviderStatusToTransactionStatus(
      response.data?.status,
    );

    this.logger.log(
      `📌 Provider status for ${reference}: ${response.data?.status} → ${txnStatus}`,
    );

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

  // ===================== Ticket Code Generation =====================
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
