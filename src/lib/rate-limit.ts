import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

let ratelimit: Ratelimit | null = null;

function getRatelimit() {
  if (!ratelimit && process.env.UPSTASH_REDIS_REST_URL) {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, '1 m'),
      analytics: true,
    });
  }
  return ratelimit;
}

export async function checkRateLimit(
  request: NextRequest,
  userId?: string
): Promise<NextResponse | null> {
  const rl = getRatelimit();
  if (!rl) return null; // Skip if Redis not configured

  const identifier = userId || request.ip || 'anonymous';
  const { success, limit, remaining, reset } = await rl.limit(identifier);

  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString(),
          'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
        },
      }
    );
  }

  return null;
}
