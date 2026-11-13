#!/bin/sh
set -e

# Volumes, die vorher unter root (z. B. alter Nixpacks-Build) beschrieben wurden,
# für den App-User beschreibbar machen. Danach ohne Root-Rechte weiterlaufen.
if [ "$(id -u)" = "0" ]; then
  for dir in /app/uploads /app/config /app/desktop-releases /app/.backup /app/.failover /app/src/generated; do
    if [ -d "$dir" ]; then
      chown -R nextjs:nodejs "$dir" 2>/dev/null || true
    fi
  done
  # Setup-Assistent schreibt .env.local ins Projektverzeichnis.
  chown nextjs:nodejs /app 2>/dev/null || true
  exec gosu nextjs "$@"
fi

exec "$@"
