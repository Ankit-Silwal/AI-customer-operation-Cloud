-- All buckets in one admission are checked and charged atomically. Redis TIME
-- avoids clock skew between replicas. Denied admissions never consume tokens.
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local states = {}
local denied = 0
local retry = 0
local selected = 1
local fraction = 2
for i, key in ipairs(KEYS) do
  local capacity = tonumber(ARGV[i * 2 - 1])
  local period = tonumber(ARGV[i * 2]) * 1000
  local previous = redis.call('HMGET', key, 'tokens', 'time')
  local tokens = capacity
  if previous[1] then
    tokens = math.min(capacity, tonumber(previous[1]) + math.max(0, now - tonumber(previous[2])) * capacity / period)
  end
  states[i] = {tokens, capacity, period}
  if tokens < 1 then
    local wait = math.ceil((1 - tokens) * period / capacity / 1000)
    if wait > retry then retry = wait; denied = i end
  end
  local remaining_fraction = math.max(0, tokens - 1) / capacity
  if remaining_fraction < fraction then fraction = remaining_fraction; selected = i end
end
if denied > 0 then
  local state = states[denied]
  return {0, denied, 0, math.ceil((state[2] - state[1]) * state[3] / state[2] / 1000), retry}
end
for i, key in ipairs(KEYS) do
  local state = states[i]
  redis.call('HSET', key, 'tokens', state[1] - 1, 'time', now)
  redis.call('PEXPIRE', key, state[3])
end
local state = states[selected]
return {1, selected, math.floor(state[1] - 1), math.ceil((state[2] - state[1] + 1) * state[3] / state[2] / 1000), 0}
