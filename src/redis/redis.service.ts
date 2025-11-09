/* eslint-disable @typescript-eslint/await-thenable */
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  async onModuleInit() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      tls: process.env.REDIS_TLS_ENABLED === 'true' ? {} : undefined,
      retryStrategy: (times) => {
        const delay = Math.min(times * 100, 3000); // Exponential backoff, max 3s
        return times > 3 ? null : delay; // Stop after 3 retries
      },
      maxRetriesPerRequest: null, // For compatibility with queue libraries if needed
      enableOfflineQueue: true, // Queue commands when offline
    });

    this.client.on('connect', () => this.logger.log('✅ Connected to Redis'));
    this.client.on('error', (err) => this.logger.error('❌ Redis Error:', err));

    try {
      await this.client.ping();
      this.logger.log('Redis PING successful');
    } catch (err) {
      this.logger.error('Redis PING failed:', err);
    }
  }

  async onModuleDestroy() {
    try {
      await this.client.disconnect();
      this.logger.log('Redis connection closed');
    } catch (err) {
      this.logger.error('Failed to close Redis connection:', err);
    }
  }

  async set(key: string, value: any, ttlSeconds?: number) {
    const data = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.set(key, data, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, data);
    }
  }

  async get<T = any>(key: string): Promise<T | null> {
    const data = await this.client.get(key);
    if (!data) return null;

    try {
      return JSON.parse(data) as T;
    } catch {
      return data as T; // Fallback to string if JSON parsing fails
    }
  }

  async del(key: string) {
    await this.client.del(key);
  }
}
