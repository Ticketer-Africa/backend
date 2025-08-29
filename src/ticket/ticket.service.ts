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
import { Prisma } from '@prisma/client';

@Injectable()
export class TicketService {
  private logger = new Logger(TicketService.name);

  constructor(
    private prisma: PrismaService,
    private paymentService: PaymentService,
  ) {}

  // ===================== Private Helpers =====================
  private sanitizeForCacheTag(value: string): string {
    return value.replace(/[^a-zA-Z0-9]/g, '_');
  }

  private async validateEvent(eventId: string) {
    const sanitizedEventId = this.sanitizeForCacheTag(eventId);
    // Caching event validation
    // - TTL: 5 minutes, SWR: 1 minute for stable event data
    // - Tags: `event_${sanitizedEventId}`, `events` for invalidation on event updates
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        isActive: true,
        date: true,
        organizerId: true,
        ticketCategories: true,
      },
      cacheStrategy: {
        ttl: 300,
        swr: 60,
        tags: [`event_${sanitizedEventId}`, 'events'],
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
    const sanitizedUserId = this.sanitizeForCacheTag(userId);
    // Caching user validation
    // - Consistent with AuthService caching
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
      cacheStrategy: {
        ttl: 300,
        swr: 60,
        tags: [`user_${sanitizedUserId}`],
      },
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
    const sanitizedTicketCategoryId =
      this.sanitizeForCacheTag(ticketCategoryId);
    // Caching ticket category validation
    // - Shorter TTL/SWR due to frequent updates (minted tickets)
    const ticketCategory = await this.prisma.ticketCategory.findFirst({
      where: { id: ticketCategoryId, eventId },
      select: {
        id: true,
        name: true,
        price: true,
        maxTickets: true,
        minted: true,
      },
      cacheStrategy: {
        ttl: 60,
        swr: 30,
        tags: [`ticket_category_${sanitizedTicketCategoryId}`],
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
    user: any,
    event: any,
    totalAmount: number,
    reference: string,
    ticketIds: string[],
    clientPage: string,
  ): Promise<string> {
    const redirectUrl = process.env.FRONTEND_URL
      ? `${process.env.FRONTEND_URL}${clientPage}`
      : undefined;

    const payload = {
      customer: { email: user.email, name: user.name },
      amount: totalAmount,
      currency: 'NGN',
      reference,
      processor: 'kora',
      narration: `Tickets for ${event.name}`,
      notification_url: process.env.NOTIFICATION_URL,
      redirect_url: redirectUrl,
      metadata: { userId: user.id },
    };

    this.logger.log(
      `💳 Initiating payment with payload:\n${JSON.stringify(payload, null, 2)}`,
    );

    const checkoutUrl = await this.paymentService.initiatePayment(payload);

    if (!checkoutUrl) {
      this.logger.error('❌ Payment gateway returned no checkout URL');
      throw new BadRequestException('Failed to generate payment link');
    }

    this.logger.log(`✅ Payment initiated, checkout URL: ${checkoutUrl}`);
    return checkoutUrl;
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

  private async invalidateTicketCache(
    ticketId: string,
    eventId: string,
    userId: string,
  ) {
    const sanitizedTicketId = this.sanitizeForCacheTag(ticketId);
    const sanitizedEventId = this.sanitizeForCacheTag(eventId);
    const sanitizedUserId = this.sanitizeForCacheTag(userId);
    const tags = [
      `ticket_${sanitizedTicketId}`,
      `resale_tickets_${sanitizedEventId}`,
      `user_tickets_${sanitizedUserId}`,
      'tickets',
    ];
    this.logger.debug(`Invalidating cache tags: ${JSON.stringify(tags)}`);
    try {
      await this.prisma.$accelerate.invalidate({ tags });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P6003'
      ) {
        this.logger.error('Cache invalidation rate limit reached:', e.message);
      } else {
        throw e;
      }
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
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P6003'
      ) {
        this.logger.error('Cache invalidation rate limit reached:', e.message);
      } else {
        throw e;
      }
    }
  }

  // ===================== Ticket Purchase =====================
  async buyNewTicket(dto: BuyNewDto, userId: string, clientPage: string) {
    this.logger.log(
      `Starting ticket purchase for event ${dto.eventId} by user ${userId}`,
    );

    const event = await this.validateEvent(dto.eventId);
    const user = await this.validateUser(userId, event);

    // Validate all ticket categories and calculate total amount
    const ticketCategories = await Promise.all(
      dto.ticketCategories.map(async (item) => {
        const category = await this.validateTicketCategory(
          item.ticketCategoryId,
          dto.eventId,
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

    // Create tickets for all categories
    let ticketIds: string[] = [];
    try {
      for (const category of ticketCategories) {
        const ids = await this.createTickets(
          userId,
          dto.eventId,
          category.id,
          category.quantity,
        );
        ticketIds = ticketIds.concat(ids);
      }
    } catch (err) {
      this.logger.error(
        `Ticket creation failed for event ${dto.eventId}`,
        err.stack,
      );
      throw new BadRequestException('Error while creating tickets');
    }

    try {
      if (totalAmount === 0) {
        await this.createTransaction(
          reference,
          userId,
          dto.eventId,
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

        // Invalidate ticket category and user ticket caches
        await Promise.all([
          ...ticketCategories.map((category) =>
            this.invalidateTicketCategoryCache(category.id),
          ),
          this.invalidateTicketCache(ticketIds[0], dto.eventId, userId),
        ]);

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

      // Paid event: Create pending transaction and initiate payment
      await this.createTransaction(
        reference,
        userId,
        dto.eventId,
        totalAmount,
        'PURCHASE',
        'PENDING',
        ticketIds,
      );

      // Invalidate user ticket cache to reflect pending transaction
      await this.invalidateTicketCache(ticketIds[0], dto.eventId, userId);

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

  async buyResaleTicket(dto: BuyResaleDto, userId: string) {
    const { ticketIds } = dto;

    if (!ticketIds || ticketIds.length === 0) {
      throw new BadRequestException('At least one ticket is required');
    }

    return this.prisma.$transaction(async (tx) => {
      // Caching resale ticket validation
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
        cacheStrategy: {
          ttl: 60,
          swr: 30,
          tags: ticketIds
            .map((id) => `ticket_${this.sanitizeForCacheTag(id)}`)
            .concat(['tickets']),
        },
      });

      const eventId = await this.validateResaleTickets(
        tickets,
        ticketIds,
        userId,
      );
      const sanitizedEventId = this.sanitizeForCacheTag(eventId);
      const buyer = await this.validateUser(userId, tickets[0].event);

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

      const totalAmount = tickets.reduce(
        (sum, ticket) => sum + (ticket.resalePrice || 0),
        0,
      );
      const reference = `resale_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 6)}`;

      await this.lockResaleTickets(tx, ticketIds);
      try {
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

        // Invalidate ticket and resale caches
        await Promise.all(
          ticketIds.map((id) =>
            this.invalidateTicketCache(id, eventId, userId),
          ),
        );

        const checkoutUrl = await this.initiatePayment(
          buyer,
          tickets[0].event,
          totalAmount,
          reference,
          ticketIds,
          '',
        );

        // Update cache tags for the query after successful transaction
        await this.prisma.$accelerate.invalidate({
          tags: [`resale_tickets_${sanitizedEventId}`, 'tickets'],
        });

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
  async listForResale(dto: ListResaleDto, userId: string) {
    const { ticketId, resalePrice, bankCode, accountNumber } = dto;
    const sanitizedTicketId = this.sanitizeForCacheTag(ticketId);

    return this.prisma.$transaction(async (tx) => {
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
        cacheStrategy: {
          ttl: 60,
          swr: 30,
          tags: [`ticket_${sanitizedTicketId}`, 'tickets'],
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

        // Invalidate ticket and resale caches
        await this.invalidateTicketCache(ticketId, ticket.eventId, userId);
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

  async removeFromResale(dto: RemoveResaleDto, userId: string) {
    const { ticketId } = dto;
    const sanitizedTicketId = this.sanitizeForCacheTag(ticketId);

    return this.prisma.$transaction(async (tx) => {
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
        cacheStrategy: {
          ttl: 60,
          swr: 30,
          tags: [`ticket_${sanitizedTicketId}`, 'tickets'],
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

        // Invalidate ticket and resale caches
        await this.invalidateTicketCache(ticketId, ticket.eventId, userId);
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

    const sanitizedEventId = eventId ? this.sanitizeForCacheTag(eventId) : null;
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
      cacheStrategy: {
        ttl: 300,
        swr: 60,
        tags: sanitizedEventId
          ? [`resale_tickets_${sanitizedEventId}`, 'tickets']
          : ['tickets'],
      },
    });
  }

  async getMyListings(userId: string) {
    const sanitizedUserId = this.sanitizeForCacheTag(userId);
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
      cacheStrategy: {
        ttl: 300,
        swr: 60,
        tags: [`user_tickets_${sanitizedUserId}`, 'tickets'],
      },
    });
  }

  async getBoughtFromResale(userId: string) {
    const sanitizedUserId = this.sanitizeForCacheTag(userId);
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
      cacheStrategy: {
        ttl: 300,
        swr: 60,
        tags: [`user_tickets_${sanitizedUserId}`, 'tickets'],
      },
    });
  }

  async getMyTickets(userId: string) {
    const sanitizedUserId = this.sanitizeForCacheTag(userId);
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
      cacheStrategy: {
        ttl: 300,
        swr: 60,
        tags: [`user_tickets_${sanitizedUserId}`, 'tickets'],
      },
    });
  }

  // ===================== Verification =====================
  async verifyTicket(payload: {
    ticketId?: string;
    code?: string;
    eventId: string;
    userId: string;
  }) {
    const { ticketId, code, eventId, userId } = payload;
    if (!ticketId && !code) {
      throw new BadRequestException('Either ticketId or code is required');
    }

    const sanitizedTag = this.sanitizeForCacheTag(ticketId || code || '');
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
      cacheStrategy: {
        ttl: 60,
        swr: 30,
        tags: [`ticket_${sanitizedTag}`, 'tickets'],
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const isOrganizer = ticket.event.organizerId === userId;

    let status = 'VALID';
    let message = 'Ticket is valid';
    let markedUsed = false;

    if (ticket.isUsed) {
      status = 'USED';
      message = 'Ticket has already been used';
    } else if (isOrganizer) {
      await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: { isUsed: true },
      });
      status = 'VALID';
      message = 'Ticket is valid and now marked as used';
      markedUsed = true;

      // Invalidate ticket cache after marking as used
      await this.invalidateTicketCache(ticket.id, eventId, ticket.userId);
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
