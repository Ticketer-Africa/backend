import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [CloudinaryModule, HttpModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
