/** База API для e2e (тот же хост, что у Nuxt `NUXT_PUBLIC_API_BASE`). */
export function e2eApiBase(): string {
  const raw = process.env.NUXT_PUBLIC_API_BASE?.trim() || 'http://127.0.0.1:4000'
  return raw.replace(/\/$/, '')
}
