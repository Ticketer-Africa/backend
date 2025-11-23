/* eslint-disable @typescript-eslint/require-await */
import { INestApplication } from '@nestjs/common';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import { RedisService } from './redis/redis.service';

export async function setupSession(app: INestApplication) {
  const redisService = app.get(RedisService);
  await redisService.ensureInitialized();
  const ioredisClient = redisService.getClient();

  console.log('✅ Redis client retrieved for session store');

  const clientWrapper = {
    get: async (key: string) => {
      return await ioredisClient.get(key);
    },
    set: async (key: string, value: string, options?: any) => {
      if (options?.EX) {
        await ioredisClient.setex(key, options.EX, value);
      } else {
        await ioredisClient.set(key, value);
      }
    },
    del: async (key: string) => {
      await ioredisClient.del(key);
    },
    exists: async (key: string) => {
      return await ioredisClient.exists(key);
    },
    expire: async (key: string, seconds: number) => {
      return await ioredisClient.expire(key, seconds);
    },
    ttl: async (key: string) => {
      return await ioredisClient.ttl(key);
    },
  };

  const store = new RedisStore({
    client: clientWrapper as any,
    prefix: 'ticketer:sess:',
    ttl: 60 * 60 * 24 * 30,
  });

  const isProduction = process.env.NODE_ENV === 'production';

  app.use(
    session({
      store,
      name: 'ticketer_sid',
      secret: process.env.SESSION_SECRET || 'fallback-secret-change-in-prod',
      resave: false,
      saveUninitialized: false,
      proxy: isProduction, // Trust proxy in production
      cookie: {
        httpOnly: true,
        secure: isProduction, // Must be true for SameSite=none
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 30,
        // Add domain only if backend and frontend are on same parent domain
        // domain: isProduction ? '.ticketer.africa' : undefined,
      },
    }),
  );

  console.log('✅ Session middleware with Redis store initialized');
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Secure cookies: ${isProduction}`);
  console.log(`SameSite: ${isProduction ? 'none' : 'lax'}`);
}
