import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PayoutCronService {
  private readonly logger = new Logger(PayoutCronService.name);
  constructor(private readonly prisma: PrismaService) {}

  async releasePayouts() {
    const now = new Date();
    this.logger.log('Starting Payout Job');

    const eventsToRelease = await this.prisma.event.findMany({
      where: {
        date: { lt: now },
        EventPayout: { released: false },
      },
      include: { EventPayout: true },
    });

    for (const event of eventsToRelease) {
      const payout = event.EventPayout;
      if (!payout) {
        this.logger.log(`No payout record for event: ${event.name}`);
        continue;
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.wallet.update({
          where: { userId: event.organizerId },
          data: { balance: { increment: payout.balance } },
        });

        await tx.eventPayout.update({
          where: { eventId: event.id },
          data: { released: true },
        });
      });

      this.logger.log(`Released payout for event: ${event.name}`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  handleCron() {
    return this.releasePayouts();
  }
}
