// Падает с кодом 1, если в app/pages/admin (рекурсивно, *.vue) есть layout: 'admin',
// но нет adminOrgModeratorReadOnly. См. constants/adminModeratorOrgPolicy.ts
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const adminPagesDir = path.join(__dirname, '../app/pages/admin')

function walkVueFiles(dir) {
  const out = []
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) out.push(...walkVueFiles(p))
    else if (ent.name.endsWith('.vue')) out.push(p)
  }
  return out
}

const layoutAdminRe = /layout:\s*['"]admin['"]/
const metaKeyRe = /adminOrgModeratorReadOnly\s*:/

const missing = []
for (const file of walkVueFiles(adminPagesDir)) {
  const src = fs.readFileSync(file, 'utf8')
  if (!layoutAdminRe.test(src)) continue
  if (!metaKeyRe.test(src)) {
    missing.push(path.relative(path.join(__dirname, '..'), file))
  }
}

if (missing.length) {
  console.error(
    '[check-admin-org-moderator-meta] В этих файлах задан layout admin, но нет adminOrgModeratorReadOnly:\n',
    missing.map((f) => `  - ${f}`).join('\n'),
  )
  process.exit(1)
}
