export function matchesSearch(query: string, values: (string | null | undefined)[]) {
  const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('de')
  const haystack = normalize(values.filter(Boolean).join(' '))
  return normalize(query).trim().split(/\s+/).every(term => haystack.includes(term))
}

export function hasMissingUnitGroup(unit: { groupId: string | null }, groups: { id: string }[]) {
  return Boolean(unit.groupId && !groups.some(group => group.id === unit.groupId))
}
