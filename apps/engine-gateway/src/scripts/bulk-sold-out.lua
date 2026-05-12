-- bulk-sold-out.lua
--
-- Marks queued users SOLD_OUT, re-checking stock before every write.
-- If a concurrent release restores stock mid-bulk, stops immediately and
-- re-adds remaining users to the queue with their original join-time scores
-- so the next drain tick awards them stock normally.
--
-- KEYS[1] = eventKey   (flash:event:{publicKey})
-- KEYS[2] = resultKey  (flash:result:{publicKey})
-- KEYS[3] = queueKey   (flash:queue:{publicKey})
--
-- ARGV    = interleaved userId/score pairs for users already ZPOPMIN'd from
--           the queue but not yet written to resultKey:
--           ARGV[1]=userId1, ARGV[2]=score1, ARGV[3]=userId2, ARGV[4]=score2 …
--           May be empty if the SOLD_OUT happened on the last element of the
--           batch — the script still drains any users left in the queue.
--
-- Returns the number of users actually marked SOLD_OUT.

local eventKey  = KEYS[1]
local resultKey = KEYS[2]
local queueKey  = KEYS[3]

-- Build ordered list from already-popped users passed as ARGV pairs.
local users  = {}
local scores = {}
for i = 1, #ARGV, 2 do
    users[#users + 1]  = ARGV[i]
    scores[#scores + 1] = ARGV[i + 1]
end

-- Atomically drain everything still waiting in the queue.
-- ZRANGEBYSCORE with WITHSCORES is supported from Redis 2.8 — safe to use here.
local remaining = redis.call('ZRANGEBYSCORE', queueKey, '-inf', '+inf', 'WITHSCORES')
redis.call('DEL', queueKey)

for i = 1, #remaining, 2 do
    users[#users + 1]  = remaining[i]
    scores[#scores + 1] = remaining[i + 1]
end

if #users == 0 then
    return 0
end

-- Re-check stock before every SOLD_OUT write.
-- Because this script runs atomically on the Redis thread, no other command
-- can interleave between the HGET and the HSET — but a concurrent release
-- that completed *before* this script started will already be reflected in
-- the stock value we read on the first iteration.
local marked = 0
for i = 1, #users do
    local stock = tonumber(redis.call('HGET', eventKey, 'stock'))
    if stock ~= nil and stock > 0 then
        -- Stock restored — put this user and everyone behind them back in the
        -- queue with their original join-time scores.
        for j = i, #users do
            redis.call('ZADD', queueKey, scores[j], users[j])
        end
        return marked
    end
    redis.call('HSET', resultKey, users[i], 'SOLD_OUT')
    marked = marked + 1
end

return marked
