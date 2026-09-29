/**
 * Pool-Konfiguration für den mariadb-Adapter — ohne Abhängigkeiten, damit auch
 * Backup/Restore-Skripte sie ohne Pfad-Aliase importieren können.
 */

export function intEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim()
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Baut eine explizite mariadb-Pool-Konfiguration aus einer Verbindungs-URL.
 *
 * Der Adapter-Default ist `connectionLimit=10`, was für ein Dashboard mit
 * mehreren pollenden Endpunkten + Hintergrund-Sync (bis zu 8 parallele
 * Verbindungen) zu knapp ist → Pool-Timeouts. Größe und Acquire-Timeout sind
 * per Env steuerbar; `acquireTimeout` sorgt außerdem für schnelles
 * Fehlschlagen statt minutenlangem Hängen.
 *
 * Verbindungsaufbau: der Treiber-Default `connectTimeout=1000` ist für eine
 * entfernte DB (Handshake inkl. Reverse-DNS auf Serverseite) zu knapp. Jeder
 * Versuch bricht dann nach 1 s ab, der Pool bleibt leer und meldet nach
 * `acquireTimeout` "pool timeout … active=0 idle=0". Keepalive und ein
 * Leerlauf-Limit unter üblichen NAT-/Firewall-Timeouts verhindern zudem, dass
 * der Pool tote Verbindungen hält und alle gleichzeitig neu aufbauen muss.
 */
export function buildPoolConfig(url: string, overrides: { connectionLimit?: number } = {}) {
  const u = new URL(url)
  const connectionLimit = overrides.connectionLimit ?? intEnv('DB_CONNECTION_LIMIT', 15)
  const acquireTimeout = intEnv('DB_POOL_ACQUIRE_TIMEOUT_MS', 20_000)
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
    connectionLimit,
    acquireTimeout,
    // Muss unter acquireTimeout liegen, sonst kappt der Treiber es ohnehin.
    connectTimeout: Math.min(intEnv('DB_CONNECT_TIMEOUT_MS', 10_000), acquireTimeout),
    keepAliveDelay: intEnv('DB_KEEPALIVE_MS', 30_000),
    idleTimeout: intEnv('DB_POOL_IDLE_TIMEOUT_S', 300),
    // Nicht den ganzen Pool warm halten — spart Neuaufbau-Stürme nach Ausfällen.
    minimumIdle: Math.min(intEnv('DB_POOL_MIN_IDLE', 3), connectionLimit),
  }
}
