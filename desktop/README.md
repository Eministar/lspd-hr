# LSPD Kill-Clips

Kleine Windows-App (Tauri), die eigene Kills im Spiel erkennt und automatisch als kurze Clips schneidet.
Die Clips landen unter `Videos\LSPD Kill-Clips` und sind höchstens 10 MB groß – sie passen also ohne
Server-Boost in Discord und können direkt in den eigenen Clips-Channel gezogen werden.

**Credits:** Die Kill-Clip-Erkennung (Kill-Feed-Texterkennung, Kill-Marker, Schnitt, Self-Clip-Aufnahme)
stammt von **Emin** und wurde aus FIB Desktop übernommen.

> ⚠️ **Hinweis:** Die Erkennung ist eine Hilfe, keine Garantie. Je nach Auflösung, HUD und Performance
> können Kills übersehen oder falsch erkannt werden – eine 100-%-Erkennung ist nicht möglich.
> Passt also trotzdem selbst auf und sichert wichtige Szenen zusätzlich von Hand.

## Entwickeln & bauen

```bash
cd desktop
npm install
npx tauri dev          # Entwicklung
npx tauri build        # Installer (NSIS) unter src-tauri/target/release/bundle/nsis
```

Voraussetzungen: Node 22, Rust (stable), Windows 10/11 mit WebView2.

## Clip-Programme

NVIDIA Instant Replay, AMD Instant Replay, Medal oder die eingebaute Self-Clip-Aufnahme
(lädt beim Einrichten einmalig ffmpeg herunter, per SHA-256 geprüft).
