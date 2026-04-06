/** Убирает служебные суффиксы вроде «(batch …)» из названия команды (тестовые/импортные данные). */
export function displayTeamNameForUi(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .replace(/\s*\(\s*batch\s+[^)]+\)/gi, '')
    .replace(/\s*\(batch[^)]*\)/gi, '')
    .trim()
}
