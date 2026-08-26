# Audit-Protokoll-Aufbewahrung

Audit-Protokolle (`AuditLog`) werden automatisch bereinigt, sobald die tägliche
Status-Automation läuft. Zusätzlich wird die Bereinigung bei normalen
Dashboard-Aufrufen opportunistisch angestoßen. Ein Marker in `SystemSetting`
stellt sicher, dass pro Kalendertag höchstens eine Bereinigung durchgeführt wird.

Standardmäßig bleiben die letzten **365 Tage** erhalten. Die Frist kann über
`AUDIT_LOG_RETENTION_DAYS` angepasst werden (zulässig: 30 bis 3650 Tage). Es
werden ausschließlich `AuditLog`-Einträge vor dem Stichtag gelöscht; Sanktionen,
Notizen und andere Fachdaten bleiben unverändert.

Für produktive Deployments sollte der vorhandene Endpoint
`POST /api/status-automation` weiterhin einmal täglich durch den bestehenden
Cron/Monitor aufgerufen werden. Dashboard-Aktivität dient als zusätzlicher
Fallback.
