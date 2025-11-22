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
  private client: Redis | null = null;
  private initPromise: Promise<void> | null = null;

  getClient(): Redis {
    if (!this.client) {
      throw new Error(
        'Redis client not initialized. Call ensureInitialized() first.',
      );
    }
    return this.client;
  }

  // Ensures Redis is initialized, can be called multiple times safely
  async ensureInitialized(): Promise<void> {
    if (this.client) {
      return; // Already initialized
    }

    if (this.initPromise) {
      // Initialization in progress, wait for it
      await this.initPromise;
      return;
    }

    // Start initialization
    this.initPromise = this.initialize();
    await this.initPromise;
  }

  async onModuleInit() {
    await this.ensureInitialized();
  }

  private async initialize(): Promise<void> {
    this.logger.log('🔄 Initializing Redis client...');

    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      tls: process.env.REDIS_TLS_ENABLED === 'true' ? {} : undefined,
      retryStrategy: (times) => {
        const delay = Math.min(times * 100, 3000);
        return times > 10 ? null : delay;
      },
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    this.client.on('connect', () => {
      this.logger.log('🔄 Connecting to Redis...');
    });

    this.client.on('ready', () => {
      this.logger.log('✅ Redis ready');
    });

    this.client.on('error', (err) => {
      this.logger.error('❌ Redis Error:', err);
    });

    this.client.on('close', () => {
      this.logger.warn('⚠️ Redis connection closed');
    });

    // Wait for Redis to be ready
    try {
      await this.client.ping();
      this.logger.log('✅ Redis PING successful - Client initialized');
    } catch (err) {
      this.logger.error('❌ Redis PING failed:', err);
      throw err;
    }
  }

  async onModuleDestroy() {
    try {
      if (this.client) {
        await this.client.quit();
        this.logger.log('✅ Redis connection closed gracefully');
      }
    } catch (err) {
      this.logger.error('❌ Failed to close Redis connection:', err);
    }
  }

  async set(key: string, value: any, ttlSeconds?: number) {
    const data = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds) {
      await this.client!.set(key, data, 'EX', ttlSeconds);
    } else {
      await this.client!.set(key, data);
    }
  }

  async get<T = any>(key: string): Promise<T | null> {
    const data = await this.client!.get(key);
    if (!data) return null;

    try {
      return JSON.parse(data) as T;
    } catch {
      return data as T;
    }
  }

  async del(key: string) {
    await this.client!.del(key);
  }
}
