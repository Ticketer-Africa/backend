import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/redis/redis.service';

@Injectable()
export class ResaleCleanupCronService {
  private readonly logger = new Logger(ResaleCleanupCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  // Runs every 10 seconds
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleAbandonedResaleCheckouts() {
    this.logger.log('Starting abandoned resale checkout cleanup job...');

    const cutoffTime = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

    try {
      const abandonedTransactions = await this.prisma.transaction.findMany({
        where: {
          type: 'RESALE',
          status: 'PENDING',
          createdAt: { lt: cutoffTime },
        },
        select: {
          reference: true,
          createdAt: true,
          eventId: true,
          tickets: {
            select: {
              ticketId: true,
              ticket: {
                select: {
                  id: true,
                  code: true,
                  event: { select: { slug: true } },
                },
              },
            },
          },
        },
      });

      if (abandonedTransactions.length === 0) {
        this.logger.log('No abandoned resale checkouts found.');
        return;
      }

      this.logger.warn(
        `Found ${abandonedTransactions.length} abandoned resale checkout(s). Re-listing tickets...`,
      );

      // Use Sets to avoid duplicates
      const ticketIdsToRelist = new Set<string>();
      const cacheKeysToInvalidate = new Set<string>();

      for (const txn of abandonedTransactions) {
        // Add ticket IDs (Set prevents duplicates)
        for (const tt of txn.tickets) {
          ticketIdsToRelist.add(tt.ticketId);
        }

        // Cache keys for invalidation
        cacheKeysToInvalidate.add(`transaction:${txn.reference}`);

        for (const { ticket } of txn.tickets) {
          cacheKeysToInvalidate.add(`ticket:${ticket.id}`);
          cacheKeysToInvalidate.add(
            `ticket:code:${ticket.code}:${txn.eventId}`,
          );
        }

        // Mark transaction as FAILED
        await this.prisma.transaction.update({
          where: { reference: txn.reference },
          data: { status: 'FAILED' },
        });

        this.logger.log(
          `Marked abandoned resale txn ${txn.reference} (created ${txn.createdAt.toISOString()}) as FAILED`,
        );
      }

      // Re-list tickets safely
      const ticketIdsArray = Array.from(ticketIdsToRelist);

      if (ticketIdsArray.length > 0) {
        await this.prisma.ticket.updateMany({
          where: { id: { in: ticketIdsArray } },
          data: { isListed: true },
        });

        this.logger.log(
          `Re-listed ${ticketIdsArray.length} unique ticket(s) back to marketplace`,
        );
      }

      // Invalidate Redis caches
      const cacheKeysArray = Array.from(cacheKeysToInvalidate);

      if (cacheKeysArray.length > 0) {
        await Promise.all(
          cacheKeysArray.map((key) => this.redisService.del(key)),
        );
        this.logger.log(
          `Invalidated ${cacheKeysArray.length} unique cache keys`,
        );
      }

      // Invalidate global resale list
      await this.redisService.del('resale:tickets:all');

      this.logger.log('Abandoned resale cleanup job completed successfully');
    } catch (error) {
      this.logger.error('Error in resale cleanup job:', error.stack);
    }
  }
}
