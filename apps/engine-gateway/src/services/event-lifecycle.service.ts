import prisma from '../lib/prisma';
import redis, { getRedisKeys } from './redis.service';
import { evictEventCache } from './event-cache.service';
import { stopDrain } from './drain.service';

export async function endEventCore(event: { id: string; publicKey: string }): Promise<void> {
  await prisma.saleEvent.update({
    where: { id: event.id },
    data:  { status: 'ENDED', endedAt: new Date() },
  });

  const { eventKey, queueKey, resultKey, outstandingKey } = getRedisKeys(event.publicKey);
  const pipeline = redis.pipeline();
  pipeline.hset(eventKey, 'status', 'ENDED');
  pipeline.expire(eventKey, 48 * 60 * 60);
  pipeline.del(queueKey);
  pipeline.del(resultKey);
  pipeline.del(outstandingKey);
  await pipeline.exec();

  stopDrain(event.publicKey);
  evictEventCache(event.publicKey);
}
