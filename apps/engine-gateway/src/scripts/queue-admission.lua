-- KEYS[1] = flash:event:{publicKey}
-- KEYS[2] = flash:queue:{publicKey}
-- KEYS[3] = flash:result:{publicKey}
-- ARGV[1] = nowMs
-- ARGV[2] = userId

local vals = redis.call('HMGET', KEYS[1], 'status', 'stock', 'rateLimit', 'admitted', 'queueCap')
local status    = vals[1]
local stock     = tonumber(vals[2])
local rateLimit = tonumber(vals[3])
local admitted  = tonumber(vals[4])
local queueCap  = tonumber(vals[5])

if status == nil or status == false then
  return {-4, 'EVENT_NOT_FOUND'}
end
if status == 'PAUSED' then
  return {-6, 'EVENT_PAUSED'}
end
if status ~= 'ACTIVE' then
  return {-3, 'EVENT_NOT_ACTIVE'}
end

-- Duplicate check
if redis.call('ZSCORE', KEYS[2], ARGV[2]) then
  return {-5, 'ALREADY_JOINED'}
end
if redis.call('HEXISTS', KEYS[3], ARGV[2]) == 1 then
  return {-5, 'ALREADY_JOINED'}
end

-- queueCap check (door closed)
if admitted >= queueCap then
  return {-1, 'SOLD_OUT'}
end

-- Everyone queues — no instant wins
redis.call('ZADD', KEYS[2], ARGV[1], ARGV[2])
redis.call('HINCRBY', KEYS[1], 'admitted', 1)
local position = redis.call('ZRANK', KEYS[2], ARGV[2])
return {0, 'QUEUED', position, rateLimit}
