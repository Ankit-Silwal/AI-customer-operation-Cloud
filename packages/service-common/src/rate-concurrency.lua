-- Expiring, renewable leases survive worker crashes without permanent locks.
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local mode = ARGV[1]
local member = ARGV[2]
local ttl = tonumber(ARGV[3])
if mode == 'release' then
  for _, key in ipairs(KEYS) do redis.call('ZREM', key, member) end
  return 1
end
for i, key in ipairs(KEYS) do
  redis.call('ZREMRANGEBYSCORE', key, '-inf', now)
  if mode == 'acquire' and redis.call('ZCARD', key) >= tonumber(ARGV[3 + i]) then return 0 end
  if mode == 'renew' and not redis.call('ZSCORE', key, member) then return 0 end
end
for _, key in ipairs(KEYS) do
  redis.call('ZADD', key, now + ttl, member)
  redis.call('PEXPIRE', key, ttl)
end
return 1
