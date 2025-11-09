import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PaymentModule } from 'src/payment/payment.module';
import { RedisService } from 'src/redis/redis.service';

@Module({
  imports: [PaymentModule, PrismaModule],
  controllers: [WalletController],
  providers: [WalletService, RedisService],
})
export class WalletModule {}
