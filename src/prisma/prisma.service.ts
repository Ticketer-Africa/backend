/* eslint-disable prettier/prettier */
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client/edge';
import { withAccelerate } from '@prisma/extension-accelerate';

// Create the extended client type outside the class
const createExtendedPrismaClient = () => {
  return new PrismaClient().$extends(withAccelerate());
};

type ExtendedPrismaClient = ReturnType<typeof createExtendedPrismaClient>;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly prisma: ExtendedPrismaClient;

  constructor() {
    this.prisma = createExtendedPrismaClient();
  }

  // Expose all model accessors
  get user() {
    return this.prisma.user;
  }

  get wallet() {
    return this.prisma.wallet;
  }

  get event() {
    return this.prisma.event;
  }

  get ticketCategory() {
    return this.prisma.ticketCategory;
  }

  get ticket() {
    return this.prisma.ticket;
  }

  get transaction() {
    return this.prisma.transaction;
  }

  get transactionTicket() {
    return this.prisma.transactionTicket;
  }

  // Expose Accelerate-specific methods
  get $accelerate() {
    return this.prisma.$accelerate;
  }

  // Expose core Prisma methods
  get $connect() {
    return this.prisma.$connect.bind(this.prisma);
  }

  get $disconnect() {
    return this.prisma.$disconnect.bind(this.prisma);
  }

  get $transaction() {
    return this.prisma.$transaction.bind(this.prisma);
  }

  get $executeRaw() {
    return this.prisma.$executeRaw.bind(this.prisma);
  }

  get $queryRaw() {
    return this.prisma.$queryRaw.bind(this.prisma);
  }

  async onModuleInit() {
    await this.prisma.$connect();
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}