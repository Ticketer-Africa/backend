/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
    constructor(private readonly prisma: PrismaService) { }

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
            totalRevenue: revenue.platformRevenue
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
            },
        });
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
        const event = await this.prisma.event.findUnique({ where: { id: eventId } });
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
    }

    listOrganizers() {
        return this.prisma.user.findMany({
            where: { role: 'ORGANIZER' },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                email: true,
                createdAt: true,
                events: {
                    select: { id: true, name: true, isActive: true },
                    orderBy: { createdAt: 'desc' },
                },
            },
        });
    }

    async getUserDetails(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isVerified: true,
                createdAt: true,
                tickets: {
                    include: { event: { select: { id: true, name: true, date: true } }, ticketCategory: true },
                    orderBy: { createdAt: 'desc' },
                },
                transactions: {
                    include: { event: { select: { id: true, name: true } }, tickets: true },
                    orderBy: { createdAt: 'desc' },
                },
            },
        });
        return user || { message: 'User not found' };
    }

    async getPlatformRevenue() {
        // Platform takes 5% on primary and resale fees as defined in Event model
        // We'll estimate by summing transactions of type PURCHASE and RESALE
        const [purchaseSum, resaleSum] = await Promise.all([
            this.prisma.transaction.aggregate({
                _sum: { amount: true },
                where: { type: 'PURCHASE', status: 'SUCCESS' },
            }),
            this.prisma.transaction.aggregate({
                _sum: { amount: true },
                where: { type: 'RESALE', status: 'SUCCESS' },
            }),
        ]);

        const totalAmount = (purchaseSum._sum.amount ?? 0) + (resaleSum._sum.amount ?? 0);
        const platformRevenue = Math.round(totalAmount * 0.05); // 5%

        return {
            totalAmount,
            platformRevenue,
        };
    }
}


