local activePlayers = {}

local function log(message)
  if Config.Debug then
    print(('[lspd-hr-playtime] %s'):format(message))
  end
end

local function getIdentifier(source, prefix)
  local identifiers = GetPlayerIdentifiers(source)
  for _, identifier in ipairs(identifiers) do
    if identifier:sub(1, #prefix) == prefix then
      return identifier
    end
  end
  return nil
end

local function buildPayload(source, eventName)
  local discord = getIdentifier(source, 'discord:')
  local license = getIdentifier(source, 'license:')

  return {
    event = eventName,
    sourceServerId = tonumber(source),
    playerName = GetPlayerName(source) or 'Unbekannt',
    discordId = discord and discord:gsub('discord:', '') or nil,
    license = license
  }
end

local function sendEvent(source, eventName)
  if not Config.Endpoint or Config.Endpoint == '' then
    print('[lspd-hr-playtime] Config.Endpoint fehlt')
    return
  end

  if not Config.Token or Config.Token == '' or Config.Token == 'HIER_DEN_FIVEM_INGEST_TOKEN_EINTRAGEN' then
    print('[lspd-hr-playtime] Config.Token fehlt')
    return
  end

  local payload = buildPayload(source, eventName)
  if not payload.discordId and not payload.license then
    log(('Spieler %s hat weder Discord noch License Identifier'):format(source))
    return
  end

  PerformHttpRequest(Config.Endpoint, function(statusCode, body)
    if statusCode < 200 or statusCode >= 300 then
      print(('[lspd-hr-playtime] HTTP %s für %s: %s'):format(statusCode, eventName, body or ''))
      return
    end
    log(('%s gesendet für %s'):format(eventName, payload.playerName))
  end, 'POST', json.encode(payload), {
    ['Content-Type'] = 'application/json',
    ['Authorization'] = 'Bearer ' .. Config.Token
  })
end

AddEventHandler('playerJoining', function()
  local source = source
  activePlayers[source] = true
  sendEvent(source, 'join')
end)

AddEventHandler('playerDropped', function()
  local source = source
  if activePlayers[source] then
    sendEvent(source, 'leave')
    activePlayers[source] = nil
  end
end)

CreateThread(function()
  Wait(5000)
  for _, playerId in ipairs(GetPlayers()) do
    local source = tonumber(playerId)
    if source then
      activePlayers[source] = true
      sendEvent(source, 'join')
    end
  end

  while true do
    Wait((Config.HeartbeatSeconds or 120) * 1000)
    for _, playerId in ipairs(GetPlayers()) do
      local source = tonumber(playerId)
      if source then
        activePlayers[source] = true
        sendEvent(source, 'heartbeat')
      end
    end
  end
end)
