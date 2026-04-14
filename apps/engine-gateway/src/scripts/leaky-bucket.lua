local key = KEYS[1]
local nowMs = ARGV[1]

-- Pull all the data from redis
local data = redis.call('HGET', key, 'status', 'stock', 'rateLimit', 'bucketTokens', 'bucketLastRefill')

local status = data[1]
local stock = tonumber(data[2])
local rateLimit = tonumber(data[3])
local bucketTokens = tonumber(data[4])
local bucketLastRefill = tonumber(data[5])

if status == nil or status == false then
    return {-4, 'EVENT_NOT_FOUND'}
end

if status ~= 'ACTIVE' then
    return {-3, 'EVENT_NOT_ACTIVE'}
end

-- Refil tokens based on last refill using leaky bucket here
-- rateLimit is tokens per second, so per-ms rate = rateLimit / 1000
local elapsed = nowMs - bucketLastRefill
local refilled = (elapsed / 1000) * rateLimit
local tokens = math.min(rateLimit, bucketTokens + refilled)

if tokens < 1 then 
    return {-2, 'RATE_LIMITED'}
end

if stock <= 0 then
    return {-1, 'STOCK_NOT_AVAILABLE'}
end


-- Consume one token and one stock
redis.call('HSET', key, 
    'bucketTokens',     tokens - 1,
    'bucketLastRefill', nowMs,
    'stock',            stock - 1)

return {1, 'WON'}