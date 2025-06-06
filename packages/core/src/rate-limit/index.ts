import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: Date;
}

export class RateLimitService {
  private ratelimit: Ratelimit;

  constructor(
    redisUrl?: string,
    redisToken?: string,
    requests: number = 10,
    window: string = '10 m'
  ) {
    let redis: Redis;

    if (redisUrl && redisToken) {
      // Use Upstash Redis
      redis = new Redis({
        url: redisUrl,
        token: redisToken,
      });
    } else {
      // Use an in-memory fallback for development
      redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL || '',
        token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
      });
    }

    this.ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(requests, window),
      analytics: true,
    });
  }

  async checkLimit(identifier: string): Promise<RateLimitResult> {
    try {
      const { success, limit, remaining, reset } = await this.ratelimit.limit(identifier);
      
      return {
        success,
        limit,
        remaining,
        reset: new Date(reset),
      };
    } catch (error) {
      // If rate limiting fails, allow the request
      console.warn('Rate limiting service unavailable:', error);
      return {
        success: true,
        limit: 0,
        remaining: 0,
        reset: new Date(),
      };
    }
  }
}

// Factory function to create a rate limit service
export function createRateLimitService(): RateLimitService {
  return new RateLimitService(
    process.env.UPSTASH_REDIS_REST_URL,
    process.env.UPSTASH_REDIS_REST_TOKEN,
    5, // 5 requests
    '1 m' // per minute
  );
}