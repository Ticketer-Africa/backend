/* eslint-disable prettier/prettier */
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  // Use normal Prisma client for local Postgres
  private readonly prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  // Model accessors
  get user() { return this.prisma.user; }
  get wallet() { return this.prisma.wallet; }
  get event() { return this.prisma.event; }
  get ticketCategory() { return this.prisma.ticketCategory; }
  get ticket() { return this.prisma.ticket; }
  get transaction() { return this.prisma.transaction; }
  get eventPayout() { return this.prisma.eventPayout; }
  get transactionTicket() { return this.prisma.transactionTicket; }

  // Core Prisma methods
  get $connect() { return this.prisma.$connect.bind(this.prisma); }
  get $disconnect() { return this.prisma.$disconnect.bind(this.prisma); }
  get $transaction() { return this.prisma.$transaction.bind(this.prisma); }
  get $executeRaw() { return this.prisma.$executeRaw.bind(this.prisma); }
  get $queryRaw() { return this.prisma.$queryRaw.bind(this.prisma); }

  async onModuleInit() {
    await this.prisma.$connect();
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}
