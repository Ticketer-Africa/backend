/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [users, events, tickets, revenue] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.event.count(),
      this.prisma.ticket.count(),
      this.getPlatformRevenue(),
    ]);

    return {
      users,
      events,
      tickets,
      totalRevenue: revenue.platformRevenue,
    };
  }

  listUsers() {
     return this.prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isVerified: true,
      createdAt: true,

      // pull related data
      tickets: {
        select: { eventId: true },
      },
      transactions: {
        where: { status: 'SUCCESS' },
        select: { amount: true },
      },
    },
  }).then(users =>
    users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      isVerified: u.isVerified,
      createdAt: u.createdAt,

      // compute values from related data
      eventsCount: new Set(u.tickets.map(t => t.eventId)).size,
      totalSpent: u.transactions.reduce((sum, tx) => sum + tx.amount, 0),
    }))
  );
  }

  listEvents() {
    return this.prisma.event.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        organizer: { select: { id: true, name: true, email: true } },
        ticketCategories: true,
      },
    });
  }

  async toggleEvent(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { isActive: true },
    });
    if (!event) return { message: 'Event not found' };

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: { isActive: !event.isActive },
    });

    return { message: 'Event status updated', event: updated };
  }

  listTransactions() {
    return this.prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
        event: { select: { id: true, name: true } },
        tickets: { include: { ticket: true } },
      },
    });
    // ✅ Includes handle it in one query
  }

  listOrganizers() {
    return this.prisma.user.findMany({
      where: { role: 'ORGANIZER' },
      orderBy: { createdAt: 'desc' },
      include: {
        events: {
          select: { id: true, name: true, isActive: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async getUserDetails(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        tickets: {
          include: {
            event: { select: { id: true, name: true, date: true } },
            ticketCategory: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        transactions: {
          include: {
            event: { select: { id: true, name: true } },
            tickets: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async getPlatformRevenue() {
    const result = await this.prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { status: 'SUCCESS' },
    });

    const totalAmount = result._sum.amount ?? 0;
    const platformRevenue = Math.round(totalAmount * 0.05);

    return { totalAmount, platformRevenue };
  }

  async getDailyRevenueAndTickets() {
    // Transactions grouped by day
    const dailyTransactions = await this.prisma.transaction.groupBy({
      by: ['createdAt'],
      _sum: { amount: true },
      where: { status: 'SUCCESS' },
    });

    // Tickets grouped by day
    const dailyTickets = await this.prisma.ticket.groupBy({
      by: ['createdAt'],
      _count: { id: true },
    });

    const revenueMap: Record<
      string,
      { totalRevenue: number; platformRevenue: number }
    > = {};

    dailyTransactions.forEach((txn) => {
      const date = txn.createdAt.toISOString().split('T')[0];
      const totalRevenue = txn._sum.amount ?? 0;
      const platformRevenue = Math.round(totalRevenue * 0.05);
      revenueMap[date] = { totalRevenue, platformRevenue };
    });

    const ticketMap: Record<string, number> = {};
    dailyTickets.forEach((t) => {
      const date = t.createdAt.toISOString().split('T')[0];
      ticketMap[date] = t._count.id;
    });

    const allDates = new Set([
      ...Object.keys(revenueMap),
      ...Object.keys(ticketMap),
    ]);

    return Array.from(allDates).map((date) => ({
      date,
      totalRevenue: revenueMap[date]?.totalRevenue ?? 0,
      platformRevenue: revenueMap[date]?.platformRevenue ?? 0,
      ticketsSold: ticketMap[date] ?? 0,
    }));
  }

  async getEventCategories() {
    const categories = await this.prisma.event.groupBy({
      by: ['category'],
      _count: { category: true },
    });

    const total = categories.reduce((acc, c) => acc + c._count.category, 0);

    return categories.map((c) => ({
      name: c.category,
      value: ((c._count.category / total) * 100).toFixed(2),
      count: c._count.category,
    }));
  }
}
