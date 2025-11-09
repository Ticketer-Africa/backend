import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventService } from './event/event.service';
import { EventModule } from './event/event.module';
import { TicketService } from './ticket/ticket.service';
import { TicketModule } from './ticket/ticket.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { PaymentService } from './payment/payment.service';
import { PaymentModule } from './payment/payment.module';
import { HttpModule } from '@nestjs/axios';
import { AdminModule } from './admin/admin.module';
import { WalletModule } from './wallet/wallet.module';
import { MailService } from './mail/mail.service';
import { KoraPayinProvider } from './payment/providers/kora.provider';
import { AggregatorPayinProvider } from './payment/providers/aggregator.provider';
import { RedisService } from './redis/redis.service';

@Module({
  imports: [
    UsersModule,
    PrismaModule,
    AuthModule,
    MailModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: 10,
        },
      ],
    }),
    EventModule,
    TicketModule,
    CloudinaryModule,
    PaymentModule,
    HttpModule,
    WalletModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    EventService,
    TicketService,
    PaymentService,
    MailService,
    RedisService,
    KoraPayinProvider,
    AggregatorPayinProvider,
  ],
  exports: [RedisService],
})
export class AppModule {}
