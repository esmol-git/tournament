/** Slug для команд: кириллица → латиница, [a-z0-9-]. */
const CYRILLIC_MAP: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  і: 'i',
  ї: 'yi',
  є: 'e',
  ґ: 'g',
};

export function slugifyFromTitle(title: string, fallback = 'team'): string {
  const raw = String(title ?? '')
    .trim()
    .toLowerCase();
  if (!raw) return fallback;

  let out = '';
  for (const char of raw) {
    out += CYRILLIC_MAP[char] ?? char;
  }

  out = out.normalize('NFD').replace(/\p{M}/gu, '');

  const slug = out
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || fallback;
}
