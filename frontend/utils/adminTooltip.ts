/**
 * PrimeVue v-tooltip по умолчанию задаёт контейнеру width:fit-content — длинный текст
 * раздуивает подсказку. Глобальные стили в admin-accents.css ограничивают max-width;
 * fitContent:false снимает inline width, чтобы переносы работали предсказуемо.
 */
export function adminTooltip(value: string) {
  return { value, fitContent: false as const }
}
