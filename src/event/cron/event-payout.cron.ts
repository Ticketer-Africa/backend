/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/redis/redis.service';

@Injectable()
export class PayoutCronService {
  private readonly logger = new Logger(PayoutCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  private async invalidateOrganizerCaches(organizerId: string) {
    const keysToDelete = [
      `ticketer:events:organizer:${organizerId}`,
      `wallet:${organizerId}`,
    ];
    if (keysToDelete.length > 0) {
      for (const key of keysToDelete) {
        await this.redisService.del(key);
      }
    }
  }

  async releasePayouts() {
    const now = new Date();
    this.logger.log('Starting Payout Job');

    const eventsToRelease = await this.prisma.event.findMany({
      where: {
        date: { lt: now },
        EventPayout: { released: false, balance: { gt: 0 } },
      },
      select: {
        id: true,
        name: true,
        organizerId: true,
        EventPayout: {
          select: { balance: true },
        },
      },
    });

    if (eventsToRelease.length === 0) {
      this.logger.log('No pending payouts to release');
      return;
    }

    const affectedOrganizers = new Set<string>();

    for (const event of eventsToRelease) {
      const payout = event.EventPayout;

      await this.prisma.$transaction(async (tx) => {
        await tx.wallet.upsert({
          where: { userId: event.organizerId },
          update: { balance: { increment: payout?.balance } },
          create: { userId: event.organizerId, balance: payout?.balance },
        });

        await tx.eventPayout.update({
          where: { eventId: event.id },
          data: { released: true, releasedAt: now },
        });
      });

      affectedOrganizers.add(event.organizerId);

      this.logger.log(
        `Released ₦${payout?.balance} payout for event: ${event.name}`,
      );
    }

    for (const organizerId of affectedOrganizers) {
      await this.invalidateOrganizerCaches(organizerId);
    }

    this.logger.log(
      `Payout job completed. Released payouts for ${eventsToRelease.length} events`,
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  handleCron() {
    return this.releasePayouts();
  }
}
