/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PaymentService } from 'src/payment/payment.service';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'src/prisma/prisma.service';
import { WithdrawalDTO } from 'src/payment/dto/initiate.dto';

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
  ) {}

  // ----------------------
  // Helper Methods
  // ----------------------

  private async validateWallet(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  private async validateOrganizer(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true, events: true },
    });
    if (!user) throw new NotFoundException('Organizer not found');
    if (!user.wallet) throw new NotFoundException('Organizer wallet not found');
    if (!['ORGANIZER', 'ADMIN', 'SUPERADMIN'].includes(user.role)) {
      throw new ForbiddenException('User is not an organizer');
    }
    return user;
  }

  private async hashPin(pin: string) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(pin, salt);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async comparePin(plain: string, hashed: string) {
    return bcrypt.compare(plain, hashed);
  }

  private generateWithdrawalReference() {
    return `withdraw_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  // ----------------------
  // Withdrawal Helpers
  // ----------------------

  private async validateWithdrawal(userId: string, payload: {
    email: string;
    name: string;
    pin: string;
    amount: number;
    account_number: string;
    bank_code: string;
    narration?: string;
  }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user?.role === 'USER') {
      throw new BadRequestException(
        'Users cannot withdraw funds...buy a ticket instead',
      );
    }

    const wallet = await this.validateWallet(userId);
    if (!wallet.pin) {
      throw new BadRequestException(
        'PIN not set. Please set your wallet PIN before withdrawing.',
      );
    }

    const isPinValid = await this.comparePin(payload.pin, wallet.pin);
    if (!isPinValid) throw new BadRequestException('Invalid PIN provided.');

    if (wallet.balance.lt(payload.amount)) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    return wallet;
  }

  private async processWithdrawal(
    userId: string,
    payload: {
      email: string;
      name: string;
      pin: string;
      amount: number;
      account_number: string;
      bank_code: string;
      narration?: string;
    },
    tx: any,
  ) {
    const reference = this.generateWithdrawalReference();
    const withdrawalDto: WithdrawalDTO = {
      customer: { email: payload.email, name: payload.name },
      amount: payload.amount,
      currency: 'NGN',
      reference,
      notificationUrl: process.env.NOTIFICATION_URL,
      narration: payload.narration || 'Wallet withdrawal',
      metadata: { userId },
      destination: {
        type: 'bank_account',
        bank_account: {
          bank: payload.bank_code,
          account: payload.account_number,
          account_name: payload.name || 'Unknown',
        },
      },
    };

    const payoutResult = await this.paymentService.initiateWithdrawal(withdrawalDto);

    await tx.wallet.update({
      where: { userId },
      data: { balance: { decrement: payload.amount } },
    });

    return { reference, payoutResult };
  }

  // ----------------------
  // Transaction Helpers
  // ----------------------

  private async fetchTransactions(organizerId: string, eventIds: string[]) {
    return this.prisma.transaction.findMany({
      where: {
        OR: [
          {
            eventId: { in: eventIds },
            type: { in: ['PURCHASE', 'RESALE'] },
            status: 'SUCCESS',
          },
          {
            userId: organizerId,
            type: 'WITHDRAW',
            status: { in: ['SUCCESS', 'FAILED'] },
          },
        ],
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        event: { select: { id: true, name: true, resaleFeeBps: true } },
        tickets: {
          select: {
            ticket: {
              select: {
                id: true,
                code: true,
                event: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private formatTransaction(tx: any) {
    return {
      id: tx.id,
      reference: tx.reference,
      type: tx.type,
      amount:
        tx.type === 'RESALE' && tx.event
          ? Math.round((tx.amount * (tx.event.resaleFeeBps ?? 500)) / 10000)
          : tx.amount,
      status: tx.status,
      createdAt: tx.createdAt,
      buyer: tx.type !== 'WITHDRAW' ? tx.user : null,
      event: tx.event,
      tickets: tx.tickets.map((t: any) => ({
        id: t.ticket.id,
        code: t.ticket.code,
        event: t.ticket.event,
      })),
    };
  }

  // ----------------------
  // Public Methods
  // ----------------------

  async checkBalance(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { balance: true },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return { balance: wallet.balance };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async withdraw(
    userId: string,
    payload: {
      email: string;
      name: string;
      pin: string;
      amount: number;
      account_number: string;
      bank_code: string;
      narration?: string;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.validateWithdrawal(userId, payload);
      const { reference, payoutResult } = await this.processWithdrawal(userId, payload, tx);
      return {
        message: 'Withdrawal initiated successfully',
        reference,
        payout: payoutResult,
      };
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async setWalletPin(
    userId: string,
    payload: { oldPin?: string; newPin: string },
  ) {
    const pinRegex = /^\d{4}$/;
    if (!pinRegex.test(payload.newPin)) {
      throw new BadRequestException('PIN must be exactly 4 digits');
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');

      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new NotFoundException('Wallet not found');

      if (wallet.pin) {
        if (!payload.oldPin) {
          throw new BadRequestException(
            'Old PIN is required to change your PIN',
          );
        }

        const isMatch = await this.comparePin(payload.oldPin, wallet.pin);
        if (!isMatch) throw new UnauthorizedException('Old PIN is incorrect');
      }

      const hashedPin = await this.hashPin(payload.newPin);

      await tx.wallet.update({
        where: { userId },
        data: { pin: hashedPin },
      });

      return {
        message: wallet.pin
          ? 'Wallet PIN updated successfully'
          : 'Wallet PIN set successfully',
      };
    });
  }

  async getTransactions(organizerId: string) {
    const user = await this.validateOrganizer(organizerId);
    const eventIds = user.events.map((event) => event.id);
    const transactions = await this.fetchTransactions(organizerId, eventIds);
    return transactions.map((tx) => this.formatTransaction(tx));
  }

  async hasWalletPin(userId: string): Promise<{ hasPin: boolean }> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { pin: true },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return { hasPin: !!wallet.pin };
  }
}