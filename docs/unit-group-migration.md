# Migration der bestehenden Units

Die Migration `20260827_group_existing_units` erstellt Unitgruppen für die
bereits vorhandenen Units und verknüpft die bekannten Basis-, Rang-, Team- und
Test-Units über `groupId`. Die bestehenden Unit- und Officer-Datensätze werden
nicht gelöscht oder neu angelegt; direkte Benutzerzuweisungen bleiben dadurch
unverändert erhalten.

Die Gruppen erscheinen mit ihren vorhandenen Fachmodulen in der Navigation.
Leitungs-Unterunits werden für HR, Academy, SRU, Air Support, Detective und
Internal Affairs als `isLeadership` markiert und können dadurch die gemeinsame
Leitungsrolle der Gruppe synchronisieren.

Die SQL-Schritte sind idempotent: Bereits gesetzte `groupId`-Werte und manuell
angelegte Unitgruppen werden nicht überschrieben. Nicht erkannte oder später
hinzugefügte Units können weiterhin im Unitgruppen-Editor einsortiert werden.
