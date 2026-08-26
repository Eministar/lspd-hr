# Commit-Legende

Die vollständige Zuordnung liegt in [`commit-legend.json`](./commit-legend.json). Jede Zeile hat eine stabile Build-ID im Format `build-<erste-10-SHA-Zeichen>` und verweist auf den zugehörigen GitHub-Commit.

Die Legende wird mit `npm run release:sync` aktualisiert. Der GitHub-Workflow `.github/workflows/sync-commit-legend.yml` führt diesen Abgleich nach jedem Push auf `main` automatisch aus. Die Oberfläche ruft GitHub zusätzlich live ab und verwendet den gespeicherten Snapshot, falls die API vorübergehend nicht erreichbar ist.
