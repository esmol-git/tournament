import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Удаляет команды и игроков, созданные seed-tenant-teams-players с тем же SEED_BATCH.
 * Порядок удаления совместим с TeamsService.delete (плюс MatchEvent перед Match).
 */
async function deleteTeamLikeService(tx: Prisma.TransactionClient, teamId: string) {
  await tx.matchEvent.deleteMany({
    where: {
      match: { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
    },
  });
  await tx.teamAdmin.deleteMany({ where: { teamId } });
  await tx.teamPlayer.deleteMany({ where: { teamId } });
  await tx.tournamentTeam.deleteMany({ where: { teamId } });
  await tx.tournamentTableRow.deleteMany({ where: { teamId } });
  await tx.match.deleteMany({
    where: { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
  });
  await tx.team.delete({ where: { id: teamId } });
}

async function main() {
  const tenantSlug = (process.env.SEED_TENANT_SLUG ?? 'impuls-2')
    .trim()
    .toLowerCase();
  const batch = (process.env.SEED_BATCH ?? '').trim();
  if (!batch) {
    throw new Error('Set SEED_BATCH to the same value used when seeding (required for safety).');
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) {
    throw new Error(`Tenant not found: slug="${tenantSlug}"`);
  }

  const prefix = `${tenant.slug}-seed-${batch}-`;
  const teams = await prisma.team.findMany({
    where: { tenantId: tenant.id, slug: { startsWith: prefix } },
    select: { id: true, slug: true },
    orderBy: { slug: 'asc' },
  });

  if (teams.length === 0) {
    console.log(`No teams matched slug prefix "${prefix}". Nothing to do.`);
    return;
  }

  console.log(
    `Tenant "${tenant.name}" (${tenant.slug}): removing ${teams.length} teams (prefix="${prefix}")`,
  );

  const playerIds = new Set<string>();
  for (const t of teams) {
    const links = await prisma.teamPlayer.findMany({
      where: { teamId: t.id },
      select: { playerId: true },
    });
    for (const l of links) playerIds.add(l.playerId);
  }

  for (const t of teams) {
    await prisma.$transaction(async (tx) => {
      await deleteTeamLikeService(tx, t.id);
    });
    console.log(`Deleted team ${t.slug}`);
  }

  if (playerIds.size > 0) {
    const res = await prisma.player.deleteMany({
      where: { id: { in: [...playerIds] }, tenantId: tenant.id },
    });
    console.log(`Deleted ${res.count} players (orphaned after team removal).`);
  }

  console.log('Cleanup done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
