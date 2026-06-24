import { ModuleWorkspace } from '@/components/modules/module-workspace'

const EMPTY_INTERNAL_AFFAIRS_DOCUMENT = `# Neuer Internal-Affairs-Bericht

## Sachverhalt

- Punkt 1
- Punkt 2

## Maßnahmen

| Thema | Status | Notiz |
| --- | --- | --- |
|  | Offen |  |
`

export default function InternalAffairsPage() {
  return (
    <ModuleWorkspace
      module="INTERNAL_AFFAIRS"
      title="Internal Affairs"
      documentTitle="Internal Affairs Dokumente"
      documentDescription="Fallnotizen, Prüfberichte und interne Dokumente der Internal Affairs"
      emptyDocument={EMPTY_INTERNAL_AFFAIRS_DOCUMENT}
      taskTitle="Internal Affairs Aufgaben"
      taskDescription="Aufgabenlisten für interne Prüfungen, Fallarbeit und Nachbereitung."
      taskAccentLabel="Internal Affairs"
      calendarTitle="Internal Affairs Kalender"
      calendarDescription="Fallbesprechungen, Briefings und Prüffristen"
      calendarEmptyLabel="Keine Internal-Affairs-Termine vorhanden"
      createToastTitle="Internal-Affairs-Termin erstellt"
      deleteToastTitle="Internal-Affairs-Termin gelöscht"
      eventTypes={[
        { value: 'INTERNAL_AFFAIRS_BRIEFING', label: 'Briefing' },
        { value: 'INTERNAL_AFFAIRS_CASE', label: 'Fallarbeit' },
        { value: 'MEETING', label: 'Besprechung' },
        { value: 'OTHER', label: 'Sonstiges' },
      ]}
      defaultType="INTERNAL_AFFAIRS_BRIEFING"
      color="#0ea5e9"
      viewPermission="internal-affairs:view"
      managePermission="internal-affairs:manage"
    />
  )
}
