import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    CloudinaryModule,
    HttpModule.register({
      timeout: 15000, // 15s
      maxRedirects: 5,
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}