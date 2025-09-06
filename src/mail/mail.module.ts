/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios'; // ← import this
import { MailService } from './mail.service';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';

@Module({
  imports: [
    CloudinaryModule,
    HttpModule.register({  // ← register HttpService here
      timeout: 5000,
      maxRedirects: 5,
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
