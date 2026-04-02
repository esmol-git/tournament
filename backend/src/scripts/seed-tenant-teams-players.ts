import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function toInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

async function main() {
  const tenantSlug = (process.env.SEED_TENANT_SLUG ?? 'impuls-2').trim().toLowerCase();
  const teamsCount = toInt(process.env.SEED_TEAMS, 20);
  const playersPerTeam = toInt(process.env.SEED_PLAYERS_PER_TEAM, 10);
  const batch =
    (process.env.SEED_BATCH ?? '').trim() || String(Date.now());

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) {
    throw new Error(`Tenant not found: slug="${tenantSlug}"`);
  }

  console.log(
    `Seeding tenant "${tenant.name}" (${tenant.slug}): ${teamsCount} teams × ${playersPerTeam} players (batch=${batch})`,
  );

  let teamsCreated = 0;
  let playersCreated = 0;
  let linksCreated = 0;

  for (let ti = 1; ti <= teamsCount; ti++) {
    const teamSlug = `${tenant.slug}-seed-${batch}-t-${String(ti).padStart(2, '0')}`;
    const team = await prisma.team.create({
      data: {
        tenantId: tenant.id,
        name: `Команда ${ti} (batch ${batch})`,
        slug: teamSlug,
        rating: (ti % 5) + 1,
      },
      select: { id: true },
    });
    teamsCreated += 1;

    for (let pi = 1; pi <= playersPerTeam; pi++) {
      const player = await prisma.player.create({
        data: {
          tenantId: tenant.id,
          firstName: `Игрок`,
          lastName: `К${ti}-П${pi}`,
        },
        select: { id: true },
      });
      playersCreated += 1;

      await prisma.teamPlayer.create({
        data: {
          teamId: team.id,
          playerId: player.id,
          jerseyNumber: pi,
          isActive: true,
        },
      });
      linksCreated += 1;
    }
  }

  console.log(
    `Done: teams=${teamsCreated}, players=${playersCreated}, teamPlayer=${linksCreated}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
