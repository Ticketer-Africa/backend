/* eslint-disable @typescript-eslint/require-await */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaymentService } from 'src/payment/payment.service';
import { BuyNewDto } from './dto/buy-new.dto';
import { ListResaleDto } from './dto/list-resale.dto';
import { BuyResaleDto } from './dto/buy-resale.dto';
import { RemoveResaleDto } from './dto/remove-resale.dto';
import { TransactionStatus, TransactionType } from '@prisma/client';
import { PayinResponse, PaymentDTO } from 'src/payment/dto/initiate.dto';

@Injectable()
export class TicketService {
  private logger = new Logger(TicketService.name);

  constructor(
    private prisma: PrismaService,
    private paymentService: PaymentService,
  ) {}

  // ===================== Private Helpers =====================
  private async validateEvent(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        isActive: true,
        slug: true,
        date: true,
        organizerId: true,
        ticketCategories: true,
      },
    });
    if (!event || !event.isActive) {
      this.logger.warn(`Event ${eventId} not found or inactive`);
      throw new NotFoundException('Event not available');
    }
    if (event.date < new Date()) {
      this.logger.warn(`Event ${eventId} already passed`);
      throw new BadRequestException('Event already passed');
    }
    return event;
  }

  private async validateUser(userId: string, event: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) {
      this.logger.error(`User ${userId} not found`);
      throw new NotFoundException('User not found');
    }
    if (userId === event.organizerId) {
      this.logger.warn(`Organizer ${userId} cannot buy their own tickets`);
      throw new BadRequestException('Organizer cannot buy their own tickets');
    }
    return user;
  }

  private async validateTicketCategory(
    ticketCategoryId: string,
    eventId: string,
  ) {
    const ticketCategory = await this.prisma.ticketCategory.findFirst({
      where: { id: ticketCategoryId, eventId },
      select: {
        id: true,
        name: true,
        price: true,
        maxTickets: true,
        minted: true,
      },
    });
    if (!ticketCategory) {
      this.logger.warn(
        `Ticket category ${ticketCategoryId} not found for event ${eventId}`,
      );
      throw new NotFoundException('Ticket category not found');
    }
    return ticketCategory;
  }

  private async createTickets(
    userId: string,
    eventId: string,
    ticketCategoryId: string,
    quantity: number,
  ): Promise<string[]> {
    const ticketIds: string[] = [];
    for (let i = 0; i < quantity; i++) {
      const code = await this.paymentService.generateUniqueTicketCode();
      const ticket = await this.prisma.ticket.create({
        data: { userId, eventId, ticketCategoryId, code },
        select: { id: true },
      });
      ticketIds.push(ticket.id);
    }
    return ticketIds;
  }

  private async createTransaction(
    reference: string,
    userId: string,
    eventId: string,
    amount: number,
    type: TransactionType,
    status: TransactionStatus,
    ticketIds: string[],
  ) {
    await this.prisma.transaction.create({
      data: {
        reference,
        userId,
        eventId,
        type,
        status,
        amount,
        tickets: { create: ticketIds.map((id) => ({ ticketId: id })) },
      },
    });
  }

  private async initiatePayment(
    user: { id: string; email: string; name?: string },
    event: { id: string; name: string; slug: string },
    totalAmount: number,
    reference: string,
    ticketIds: string[],
    clientPage: string,
    type: 'PURCHASE' | 'RESALE' = 'PURCHASE',
  ): Promise<string> {
    const redirectUrl = process.env.FRONTEND_URL
      ? type === 'PURCHASE'
        ? `${process.env.FRONTEND_URL}/events/` + event.slug
        : `${process.env.FRONTEND_URL}/my-tickets`
      : undefined;

    const paymentDto: PaymentDTO = {
      amount: totalAmount,
      currency: 'NGN',
      reference,
      customer: { email: user.email, name: user.name },
      redirectUrl,
      notificationUrl: process.env.NOTIFICATION_URL,
      narration: `${type === 'PURCHASE' ? 'Ticket purchase' : 'Resale ticket purchase'} for ${event.name}`,
      metadata: { userId: user.id },
    };

    this.logger.log(
      `💳 Initiating payment with payload:\n${JSON.stringify(paymentDto, null, 2)}`,
    );

    let response: PayinResponse;
    try {
      response = await this.paymentService.initiatePayin(paymentDto);
    } catch (error) {
      this.logger.error(`❌ Payment initiation failed: ${error.message}`);
      throw new BadRequestException('Failed to initiate payment');
    }

    if (!response.data.checkoutUrl) {
      this.logger.error('❌ Payment gateway returned no checkout URL');
      throw new BadRequestException('Failed to generate payment link');
    }

    this.logger.log(
      `✅ Payment initiated, checkout URL: ${response.data.checkoutUrl}`,
    );
    return response.data.checkoutUrl;
  }

  private async rollbackTransaction(reference: string, ticketIds: string[]) {
    await this.prisma.transactionTicket.deleteMany({
      where: { ticketId: { in: ticketIds } },
    });
    await this.prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await this.prisma.transaction.delete({ where: { reference } });
  }

  private async validateResaleTickets(
    tickets: any[],
    ticketIds: string[],
    userId: string,
  ) {
    if (tickets.length !== ticketIds.length) {
      throw new NotFoundException(
        'One or more tickets not found or not listed for resale',
      );
    }
    const eventId = tickets[0].eventId;
    const allSameEvent = tickets.every((ticket) => ticket.eventId === eventId);
    if (!allSameEvent) {
      throw new BadRequestException(
        'All tickets must belong to the same event',
      );
    }
    for (const ticket of tickets) {
      if (ticket.userId === userId) {
        throw new BadRequestException('You cannot buy your own ticket');
      }
      if (!ticket.event.isActive || ticket.event.date < new Date()) {
        throw new BadRequestException(
          `Event for ticket ${ticket.id} is not active or has passed`,
        );
      }
      if (userId === ticket.event.organizerId) {
        this.logger.warn(`Organizer ${userId} cannot buy their own tickets`);
        throw new BadRequestException('Organizer cannot buy their own tickets');
      }
    }
    return eventId;
  }

  private async lockResaleTickets(tx: any, ticketIds: string[]) {
    await tx.ticket.updateMany({
      where: { id: { in: ticketIds } },
      data: { isListed: false },
    });
  }

  // ===================== Ticket Purchase =====================
  private async validateTicketCategories(dto: BuyNewDto, eventId: string) {
    return Promise.all(
      dto.ticketCategories.map(async (item) => {
        const category = await this.validateTicketCategory(
          item.ticketCategoryId,
          eventId,
        );
        if (category.minted + item.quantity > category.maxTickets) {
          this.logger.warn(
            `Not enough tickets for category ${item.ticketCategoryId}`,
          );
          throw new BadRequestException(
            `Not enough tickets available in category ${category.name}`,
          );
        }
        return { ...category, quantity: item.quantity };
      }),
    );
  }

  private async createTicketsForCategories(
    userId: string,
    eventId: string,
    ticketCategories: any[],
  ) {
    let ticketIds: string[] = [];
    try {
      for (const category of ticketCategories) {
        const ids = await this.createTickets(
          userId,
          eventId,
          category.id,
          category.quantity,
        );
        ticketIds = ticketIds.concat(ids);
      }
      return ticketIds;
    } catch (err) {
      this.logger.error(
        `Ticket creation failed for event ${eventId}`,
        err.stack,
      );
      throw new BadRequestException('Error while creating tickets');
    }
  }

  private async handleFreeTicketPurchase(
    userId: string,
    eventId: string,
    ticketCategories: any[],
    ticketIds: string[],
    reference: string,
  ) {
    await this.createTransaction(
      reference,
      userId,
      eventId,
      0,
      'PURCHASE',
      'SUCCESS',
      ticketIds,
    );

    await Promise.all(
      ticketCategories.map((category) =>
        this.prisma.ticketCategory.update({
          where: { id: category.id },
          data: { minted: { increment: category.quantity } },
        }),
      ),
    );

    const txn = await this.prisma.transaction.findUnique({
      where: { reference },
      select: {
        reference: true,
        user: { select: { email: true, name: true } },
        event: {
          select: {
            name: true,
            organizer: { select: { email: true, name: true } },
          },
        },
      },
    });

    const ticketDetails = await this.prisma.ticket.findMany({
      where: { id: { in: ticketIds } },
      select: { id: true, ticketCategory: { select: { name: true } } },
    });

    const formattedDetails = ticketDetails.map((t) => ({
      categoryName: t.ticketCategory?.name,
      ticketId: t.id,
    }));

    await this.paymentService.sendPurchaseEmails(txn, formattedDetails, 0);

    return {
      message: 'Free tickets created successfully',
      ticketIds,
    };
  }

  private async handlePaidTicketPurchase(
    user: any,
    event: any,
    totalAmount: number,
    ticketIds: string[],
    reference: string,
    clientPage: string,
  ) {
    await this.createTransaction(
      reference,
      user.id,
      event.id,
      totalAmount,
      'PURCHASE',
      'PENDING',
      ticketIds,
    );

    this.logger.log(
      `Preparing to initiate payment for ${ticketIds.length} tickets, ref: ${reference}`,
    );
    const checkoutUrl = await this.initiatePayment(
      user,
      event,
      totalAmount,
      reference,
      ticketIds,
      clientPage,
    );

    this.logger.log(
      `Payment initiated successfully for ${ticketIds.length} tickets: ${checkoutUrl}`,
    );
    return { checkoutUrl };
  }

  async buyNewTicket(dto: BuyNewDto, userId: string, clientPage: string) {
    this.logger.log(
      `Starting ticket purchase for event ${dto.eventId} by user ${userId}`,
    );

    const event = await this.validateEvent(dto.eventId);
    const user = await this.validateUser(userId, event);
    const ticketCategories = await this.validateTicketCategories(
      dto,
      dto.eventId,
    );

    const hasFree = ticketCategories.some((c) => c.price === 0);
    const hasPaid = ticketCategories.some((c) => c.price > 0);

    if (hasFree && hasPaid) {
      this.logger.warn(
        `User ${userId} attempted to mix free and paid tickets in one purchase`,
      );
      throw new BadRequestException(
        'You cannot combine free and paid tickets in the same purchase. Please get them separately.',
      );
    }

    const totalAmount = ticketCategories.reduce(
      (sum, category) => sum + category.price * category.quantity,
      0,
    );
    const reference = `txn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const ticketIds = await this.createTicketsForCategories(
      userId,
      dto.eventId,
      ticketCategories,
    );

    try {
      if (totalAmount === 0) {
        return await this.handleFreeTicketPurchase(
          userId,
          dto.eventId,
          ticketCategories,
          ticketIds,
          reference,
        );
      }

      return await this.handlePaidTicketPurchase(
        user,
        event,
        totalAmount,
        ticketIds,
        reference,
        clientPage,
      );
    } catch (err) {
      this.logger.error(
        `Payment initiation failed for ${ticketIds.length} tickets, ref ${reference}: ${err.message}`,
        err.stack,
      );
      await this.rollbackTransaction(reference, ticketIds);
      throw new BadRequestException(
        'Payment initialization failed. Please try again.',
      );
    }
  }

  // ===================== Resale Purchase =====================
  private async validateResaleTransaction(tx: any, ticketIds: string[]) {
    const existingTx = await tx.transaction.findFirst({
      where: {
        status: 'PENDING',
        type: 'RESALE',
        tickets: { some: { ticketId: { in: ticketIds } } },
      },
      select: { reference: true },
    });
    if (existingTx) {
      throw new BadRequestException(
        'Some tickets are already reserved in another transaction',
      );
    }
  }

  private async createResaleTransaction(
    tx: any,
    userId: string,
    eventId: string,
    totalAmount: number,
    ticketIds: string[],
    reference: string,
  ) {
    await tx.transaction.create({
      data: {
        reference,
        userId,
        eventId,
        amount: totalAmount,
        type: 'RESALE',
        status: 'PENDING',
        tickets: {
          create: ticketIds.map((id) => ({ ticket: { connect: { id } } })),
        },
      },
    });
  }

  async buyResaleTicket(dto: BuyResaleDto, userId: string) {
    const { ticketIds } = dto;

    if (!ticketIds || ticketIds.length === 0) {
      throw new BadRequestException('At least one ticket is required');
    }

    return this.prisma.$transaction(async (tx) => {
      const tickets = await tx.ticket.findMany({
        where: {
          id: { in: ticketIds },
          isListed: true,
          resalePrice: { not: null },
        },
        select: {
          id: true,
          eventId: true,
          userId: true,
          resalePrice: true,
          event: { select: { isActive: true, date: true, organizerId: true } },
          user: { select: { id: true, email: true, name: true } },
          ticketCategory: { select: { name: true, price: true } },
        },
      });

      const eventId = await this.validateResaleTickets(
        tickets,
        ticketIds,
        userId,
      );
      const buyer = await this.validateUser(userId, tickets[0].event);

      await this.validateResaleTransaction(tx, ticketIds);

      const totalAmount = tickets.reduce(
        (sum, ticket) => sum + (ticket.resalePrice || 0),
        0,
      );
      const reference = `resale_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 6)}`;

      await this.lockResaleTickets(tx, ticketIds);
      try {
        await this.createResaleTransaction(
          tx,
          userId,
          eventId,
          totalAmount,
          ticketIds,
          reference,
        );

        const checkoutUrl = await this.initiatePayment(
          buyer,
          tickets[0].event,
          totalAmount,
          reference,
          ticketIds,
          '',
          'RESALE',
        );

        return { checkoutUrl };
      } catch (err) {
        await tx.ticket.updateMany({
          where: { id: { in: ticketIds } },
          data: { isListed: true },
        });
        this.logger.error(
          `Failed to generate payment link for resale tickets: ${err.message}`,
          err.stack,
        );
        throw new BadRequestException('Failed to generate payment link');
      }
    });
  }

  // ===================== Resale Management =====================
  private async validateTicketForResale(
    tx: any,
    ticketId: string,
    userId: string,
  ) {
    const ticket = await tx.ticket.findFirst({
      where: { id: ticketId, userId },
      select: {
        id: true,
        userId: true,
        eventId: true,
        isUsed: true,
        isListed: true,
        resaleCount: true,
        event: { select: { isActive: true, date: true } },
        ticketCategory: { select: { name: true, price: true } },
      },
    });
    if (!ticket) {
      throw new NotFoundException('Ticket not found or not owned by user');
    }
    if (ticket.isUsed) {
      throw new BadRequestException(
        `Ticket ${ticket.id} has already been used`,
      );
    }
    if (ticket.isListed) {
      throw new BadRequestException(`Ticket ${ticket.id} is already listed`);
    }
    if (ticket.resaleCount >= 1) {
      throw new BadRequestException(
        `Ticket ${ticket.id} can only be resold once`,
      );
    }
    if (
      !ticket.event ||
      !ticket.event.isActive ||
      ticket.event.date < new Date()
    ) {
      throw new BadRequestException(
        `Event is not active or has already passed`,
      );
    }
    return ticket;
  }

  async listForResale(dto: ListResaleDto, userId: string) {
    const { ticketId, resalePrice, bankCode, accountNumber } = dto;

    return this.prisma.$transaction(async (tx) => {
      await this.validateTicketForResale(tx, ticketId, userId);

      try {
        const updatedTicket = await tx.ticket.update({
          where: { id: ticketId },
          data: {
            isListed: true,
            resalePrice,
            listedAt: new Date(),
            bankCode,
            accountNumber,
          },
          select: {
            id: true,
            isListed: true,
            resalePrice: true,
            listedAt: true,
            bankCode: true,
            accountNumber: true,
          },
        });

        return updatedTicket;
      } catch (err) {
        this.logger.error(
          `Failed to list ticket ${ticketId} for resale`,
          err.stack,
        );
        throw new BadRequestException('Failed to list ticket for resale');
      }
    });
  }

  private async validateTicketForRemoval(
    tx: any,
    ticketId: string,
    userId: string,
  ) {
    const ticket = await tx.ticket.findFirst({
      where: { id: ticketId, userId },
      select: {
        id: true,
        userId: true,
        eventId: true,
        isListed: true,
        event: { select: { isActive: true, date: true } },
        ticketCategory: { select: { name: true, price: true } },
      },
    });
    if (!ticket) {
      throw new NotFoundException('Ticket not found or not owned by user');
    }
    if (!ticket.isListed) {
      throw new BadRequestException(
        `Ticket ${ticket.id} is not listed for resale`,
      );
    }
    if (
      !ticket.event ||
      !ticket.event.isActive ||
      ticket.event.date < new Date()
    ) {
      throw new BadRequestException(
        `Event is not active or has already passed`,
      );
    }
    return ticket;
  }

  async removeFromResale(dto: RemoveResaleDto, userId: string) {
    const { ticketId } = dto;

    return this.prisma.$transaction(async (tx) => {
      await this.validateTicketForRemoval(tx, ticketId, userId);

      try {
        const updatedTicket = await tx.ticket.update({
          where: { id: ticketId },
          data: {
            isListed: false,
            resalePrice: null,
            listedAt: null,
            bankCode: null,
            accountNumber: null,
          },
          select: {
            id: true,
            isListed: true,
            resalePrice: true,
            listedAt: true,
            bankCode: true,
            accountNumber: true,
          },
        });

        return updatedTicket;
      } catch (err) {
        this.logger.error(
          `Failed to remove ticket ${ticketId} from resale`,
          err.stack,
        );
        throw new BadRequestException('Failed to remove ticket from resale');
      }
    });
  }

  // ===================== Queries =====================
  async getResaleTickets(eventId?: string) {
    const where: any = { isListed: true, soldTo: null };
    if (eventId) where.eventId = eventId;

    return this.prisma.ticket.findMany({
      where,
      select: {
        id: true,
        eventId: true,
        userId: true,
        resalePrice: true,
        listedAt: true,
        event: {
          select: { name: true, date: true, isActive: true, bannerUrl: true },
        },
        user: {
          select: { id: true, name: true, email: true, profileImage: true },
        },
        ticketCategory: { select: { name: true, price: true } },
      },
      orderBy: { listedAt: 'desc' },
    });
  }

  async getMyListings(userId: string) {
    return this.prisma.ticket.findMany({
      where: { userId, isListed: true },
      select: {
        id: true,
        eventId: true,
        userId: true,
        resalePrice: true,
        listedAt: true,
        event: { select: { name: true, date: true, isActive: true } },
        ticketCategory: { select: { name: true, price: true } },
      },
      orderBy: { listedAt: 'desc' },
    });
  }

  async getBoughtFromResale(userId: string) {
    return this.prisma.ticket.findMany({
      where: { soldTo: userId },
      select: {
        id: true,
        eventId: true,
        userId: true,
        resalePrice: true,
        listedAt: true,
        event: { select: { name: true, date: true, isActive: true } },
        user: { select: { id: true, name: true } },
        ticketCategory: { select: { name: true, price: true } },
      },
      orderBy: { listedAt: 'desc' },
    });
  }

  async getMyTickets(userId: string) {
    return this.prisma.ticket.findMany({
      where: {
        userId,
        TransactionTicket: { some: { transaction: { status: 'SUCCESS' } } },
      },
      include: {
        event: true,
        ticketCategory: { select: { name: true, price: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ===================== Verification =====================
  private async findTicketForVerification(payload: {
    ticketId?: string;
    code?: string;
    eventId: string;
  }) {
    const { ticketId, code, eventId } = payload;
    if (!ticketId && !code) {
      throw new BadRequestException('Either ticketId or code is required');
    }

    const ticket = await this.prisma.ticket.findFirst({
      where: { eventId, ...(ticketId ? { id: ticketId } : { code }) },
      select: {
        id: true,
        code: true,
        eventId: true,
        userId: true,
        isUsed: true,
        event: {
          select: { organizerId: true, name: true, date: true, isActive: true },
        },
        ticketCategory: { select: { name: true, price: true } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  private async markTicketAsUsed(tx: any, ticketId: string) {
    await tx.ticket.update({
      where: { id: ticketId },
      data: { isUsed: true },
    });
  }

  async verifyTicket(payload: {
    ticketId?: string;
    code?: string;
    eventId: string;
    userId: string;
  }) {
    const ticket = await this.findTicketForVerification(payload);
    const isOrganizer = ticket.event.organizerId === payload.userId;

    let status = 'VALID';
    let message = 'Ticket is valid';
    let markedUsed = false;

    if (ticket.isUsed) {
      status = 'USED';
      message = 'Ticket has already been used';
    } else if (isOrganizer) {
      await this.markTicketAsUsed(this.prisma, ticket.id);
      status = 'VALID';
      message = 'Ticket is valid and now marked as used';
      markedUsed = true;
    }

    return {
      ticketId: ticket.id,
      code: ticket.code,
      eventId: ticket.eventId,
      ticketCategory: ticket.ticketCategory,
      status,
      markedUsed,
      message,
    };
  }
}
