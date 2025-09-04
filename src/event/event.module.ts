import { Module } from '@nestjs/common';
import { EventService } from './event.service';
import { EventController } from './event.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';
import { PrismaService } from 'src/prisma/prisma.service';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { PayoutCronService } from './cron/event-payout.cron';

@Module({
  imports: [PrismaModule, CloudinaryModule],
  providers: [
    EventService,
    PrismaService,
    CloudinaryService,
    PayoutCronService,
  ],
  controllers: [EventController],
})
export class EventModule {}
