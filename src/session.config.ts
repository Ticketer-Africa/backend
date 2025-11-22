/* eslint-disable @typescript-eslint/require-await */
import { INestApplication } from '@nestjs/common';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import { RedisService } from './redis/redis.service';

export async function setupSession(app: INestApplication) {
  const redisService = app.get(RedisService);

  // Ensure Redis is initialized before getting the client
  await redisService.ensureInitialized();

  const ioredisClient = redisService.getClient();

  console.log('✅ Redis client retrieved for session store');

  // Create a wrapper that makes ioredis compatible with connect-redis
  const clientWrapper = {
    get: async (key: string) => {
      return await ioredisClient.get(key);
    },
    set: async (key: string, value: string, options?: any) => {
      // Handle EX (expiration in seconds)
      if (options?.EX) {
        await ioredisClient.setex(key, options.EX, value);
      } else {
        await ioredisClient.set(key, value);
      }
    },
    del: async (key: string) => {
      await ioredisClient.del(key);
    },
    // Add other methods that connect-redis might need
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
    ttl: 60 * 60 * 24 * 30, // 30 days in seconds
  });

  app.use(
    session({
      store,
      name: 'ticketer_sid',
      secret: process.env.SESSION_SECRET || 'fallback-secret-change-in-prod',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 30,
      },
    }),
  );

  console.log('✅ Session middleware with Redis store initialized');
}
