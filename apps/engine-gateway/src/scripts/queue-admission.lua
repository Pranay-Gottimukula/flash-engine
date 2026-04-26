local eventKey  = KEYS[1]
local queueKey  = KEYS[2]
local resultKey = KEYS[3]
local nowMs     = tonumber(ARGV[1])
local userId    = ARGV[2]

-- Step 1: Read all event fields in one round-trip
local data = redis.call('HMGET', eventKey,
    'status', 'stock', 'rateLimit', 'bucketTokens', 'bucketLastRefill', 'admitted', 'queueCap')

local status           = data[1]
local stock            = tonumber(data[2])
local rateLimit        = tonumber(data[3])
local bucketTokens     = tonumber(data[4])
local bucketLastRefill = tonumber(data[5])
local admitted         = tonumber(data[6])
local queueCap         = tonumber(data[7])

-- Step 2
if status == nil or status == false then
    return {-4, 'EVENT_NOT_FOUND'}
end

-- Step 3
if status ~= 'ACTIVE' then
    return {-3, 'EVENT_NOT_ACTIVE'}
end

-- Step 4: already in the waiting queue
local inQueue = redis.call('ZSCORE', queueKey, userId)
if inQueue then
    return {-5, 'ALREADY_JOINED'}
end

-- Step 5: already has a result (won or sold-out from a previous drain)
local inResults = redis.call('HEXISTS', resultKey, userId)
if inResults == 1 then
    return {-5, 'ALREADY_JOINED'}
end

-- Step 6: system is at capacity — no more admissions
if admitted >= queueCap then
    return {-1, 'SOLD_OUT'}
end

-- Step 7: leaky-bucket token refill
local elapsed  = nowMs - bucketLastRefill
local refilled = (elapsed / 1000) * rateLimit
local tokens   = math.min(rateLimit, bucketTokens + refilled)

-- Step 8: instant win — token available AND stock on hand
if tokens >= 1 and stock > 0 then
    redis.call('HSET', eventKey,
        'bucketTokens',     tokens - 1,
        'bucketLastRefill', nowMs,
        'stock',            stock - 1,
        'admitted',         admitted + 1)
    redis.call('HSET', resultKey, userId, 'WON')
    return {1, 'WON'}
end

-- Step 9: queue path — rate-limited OR stock temporarily empty, but room in system
-- Stock may be released later via the release route; drain loop handles SOLD_OUT marking.
redis.call('ZADD', queueKey, nowMs, userId)
redis.call('HINCRBY', eventKey, 'admitted', 1)
local position = redis.call('ZRANK', queueKey, userId)
return {0, 'QUEUED', position}
