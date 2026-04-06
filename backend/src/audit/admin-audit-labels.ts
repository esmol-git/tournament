import { PrismaService } from '../prisma/prisma.service';
import type { AuditHumanActionLang } from './admin-audit-human-action';

export function auditResourceLabelKey(
  resourceType: string,
  resourceId: string,
): string {
  return `${resourceType}:${resourceId}`;
}

function galleryFallback(lang: AuditHumanActionLang): string {
  return lang === 'en' ? 'Gallery image' : 'Фото галереи';
}

/**
 * Пакетная подгрузка человекочитаемых подписей сущностей для строк журнала.
 */
export async function fetchAuditResourceLabels(
  prisma: PrismaService,
  tenantId: string,
  inputs: ReadonlyArray<{ resourceType: string; resourceId: string | null }>,
  lang: AuditHumanActionLang,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const tournamentIds = new Set<string>();
  const newsTagIds = new Set<string>();
  const newsIds = new Set<string>();
  const matchIds = new Set<string>();
  const tournamentTeamIds = new Set<string>();
  const galleryImageIds = new Set<string>();
  const matchScheduleReasonIds = new Set<string>();
  const tenantIds = new Set<string>();

  for (const { resourceType, resourceId } of inputs) {
    if (!resourceId?.trim()) continue;
    const id = resourceId.trim();
    switch (resourceType) {
      case 'tournament':
      case 'tournament_gallery':
        tournamentIds.add(id);
        break;
      case 'news_tag':
        newsTagIds.add(id);
        break;
      case 'tenant_news':
      case 'tournament_news':
        newsIds.add(id);
        break;
      case 'match':
        matchIds.add(id);
        break;
      case 'tournament_team':
        tournamentTeamIds.add(id);
        break;
      case 'tournament_gallery_image':
        galleryImageIds.add(id);
        break;
      case 'match_schedule_reason':
        matchScheduleReasonIds.add(id);
        break;
      case 'tenant':
        tenantIds.add(id);
        break;
      default:
        break;
    }
  }

  await Promise.all([
    tournamentIds.size
      ? prisma.tournament
          .findMany({
            where: { tenantId, id: { in: [...tournamentIds] } },
            select: { id: true, name: true },
          })
          .then((rows) => {
            for (const r of rows) {
              out.set(auditResourceLabelKey('tournament', r.id), r.name);
              out.set(
                auditResourceLabelKey('tournament_gallery', r.id),
                r.name,
              );
            }
          })
      : Promise.resolve(),
    newsTagIds.size
      ? prisma.newsTag
          .findMany({
            where: { tenantId, id: { in: [...newsTagIds] } },
            select: { id: true, name: true },
          })
          .then((rows) => {
            for (const r of rows) {
              out.set(auditResourceLabelKey('news_tag', r.id), r.name);
            }
          })
      : Promise.resolve(),
    newsIds.size
      ? prisma.tournamentNews
          .findMany({
            where: { tenantId, id: { in: [...newsIds] } },
            select: { id: true, title: true },
          })
          .then((rows) => {
            for (const r of rows) {
              out.set(auditResourceLabelKey('tenant_news', r.id), r.title);
              out.set(auditResourceLabelKey('tournament_news', r.id), r.title);
            }
          })
      : Promise.resolve(),
    matchIds.size
      ? prisma.match
          .findMany({
            where: { tenantId, id: { in: [...matchIds] } },
            select: {
              id: true,
              homeTeam: { select: { name: true } },
              awayTeam: { select: { name: true } },
            },
          })
          .then((rows) => {
            for (const r of rows) {
              const h = r.homeTeam?.name ?? '?';
              const a = r.awayTeam?.name ?? '?';
              out.set(auditResourceLabelKey('match', r.id), `${h} — ${a}`);
            }
          })
      : Promise.resolve(),
    tournamentTeamIds.size
      ? prisma.tournamentTeam
          .findMany({
            where: { tenantId, id: { in: [...tournamentTeamIds] } },
            select: { id: true, team: { select: { name: true } } },
          })
          .then((rows) => {
            for (const r of rows) {
              out.set(
                auditResourceLabelKey('tournament_team', r.id),
                r.team?.name ?? '—',
              );
            }
          })
      : Promise.resolve(),
    galleryImageIds.size
      ? prisma.tournamentGalleryImage
          .findMany({
            where: { tenantId, id: { in: [...galleryImageIds] } },
            select: { id: true, caption: true },
          })
          .then((rows) => {
            for (const r of rows) {
              const cap = r.caption?.trim();
              out.set(
                auditResourceLabelKey('tournament_gallery_image', r.id),
                cap && cap.length > 0 ? cap : galleryFallback(lang),
              );
            }
          })
      : Promise.resolve(),
    matchScheduleReasonIds.size
      ? prisma.matchScheduleReason
          .findMany({
            where: { tenantId, id: { in: [...matchScheduleReasonIds] } },
            select: { id: true, name: true },
          })
          .then((rows) => {
            for (const r of rows) {
              out.set(
                auditResourceLabelKey('match_schedule_reason', r.id),
                r.name,
              );
            }
          })
      : Promise.resolve(),
    tenantIds.size
      ? prisma.tenant
          .findMany({
            where: { id: { in: [...tenantIds] } },
            select: { id: true, name: true },
          })
          .then((rows) => {
            for (const r of rows) {
              out.set(auditResourceLabelKey('tenant', r.id), r.name);
            }
          })
      : Promise.resolve(),
  ]);

  return out;
}

export async function fetchAuditUserLabels(
  prisma: PrismaService,
  tenantId: string,
  userIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      userIds.filter(
        (u): u is string => typeof u === 'string' && u.trim().length > 0,
      ),
    ),
  ];
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await prisma.user.findMany({
    where: { tenantId, id: { in: ids } },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      lastName: true,
    },
  });
  const out = new Map<string, string>();
  for (const r of rows) {
    const full = `${r.name} ${r.lastName ?? ''}`.trim();
    const base = full.length > 0 ? full : r.username;
    const emailPart = r.email?.trim() ? ` · ${r.email.trim()}` : '';
    out.set(r.id, `${base}${emailPart}`);
  }
  return out;
}
