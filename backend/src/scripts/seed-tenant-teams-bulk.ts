import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { slugifyFromTitle } from '../utils/slugify';
import { TEAM_SEED_PROFILES_UNIQ } from './team-seed-names.util';

const prisma = new PrismaClient();

function toInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

function buildTeamSlug(
  name: string,
  batch: string,
  index: number,
  used: Set<string>,
): string {
  const base = slugifyFromTitle(name, 'team');
  const suffix = `${batch.slice(-6)}-${String(index + 1).padStart(3, '0')}`;
  let slug = `${base}-${suffix}`.slice(0, 80);
  let n = 2;
  while (used.has(slug)) {
    slug = `${base}-${suffix}-${n}`.slice(0, 80);
    n += 1;
  }
  used.add(slug);
  return slug;
}

async function main() {
  const tenantSlug = (process.env.SEED_TENANT_SLUG ?? 'yaff').trim().toLowerCase();
  const teamCount = toInt(process.env.SEED_TEAM_COUNT, 100);
  const batch = (process.env.SEED_BATCH ?? '').trim() || String(Date.now());
  const seed = toInt(process.env.SEED_RANDOM, Date.now() % 1_000_000_000);
  const skipExistingNames =
    process.env.SEED_SKIP_EXISTING_NAMES?.trim() !== '0';

  const poolMax = TEAM_SEED_PROFILES_UNIQ.length;
  if (teamCount > poolMax) {
    throw new Error(
      `SEED_TEAM_COUNT=${teamCount} exceeds pool size ${poolMax}. Lower count or extend team-seed-names.util.ts`,
    );
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) {
    throw new Error(`Tenant not found: slug="${tenantSlug}"`);
  }

  const existingBefore = await prisma.team.count({ where: { tenantId: tenant.id } });
  const existingNames = skipExistingNames
    ? new Set(
        (
          await prisma.team.findMany({
            where: { tenantId: tenant.id },
            select: { name: true },
          })
        ).map((t) => t.name),
      )
    : new Set<string>();

  const rng = makeRng(seed);
  const shuffled = [...TEAM_SEED_PROFILES_UNIQ];
  shuffleInPlace(shuffled, rng);
  const profiles = shuffled.slice(0, teamCount);

  const usedSlugs = new Set(
    (
      await prisma.team.findMany({
        where: { tenantId: tenant.id, slug: { not: null } },
        select: { slug: true },
      })
    )
      .map((t) => t.slug)
      .filter((s): s is string => !!s),
  );

  const data: Prisma.TeamCreateManyInput[] = [];
  let skipped = 0;

  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i]!;
    if (existingNames.has(profile.name)) {
      skipped += 1;
      continue;
    }
    data.push({
      tenantId: tenant.id,
      name: profile.name,
      slug: buildTeamSlug(profile.name, batch, i, usedSlugs),
      category: profile.category,
      rating: profile.rating,
    });
  }

  if (!data.length) {
    console.log(
      `BULK_TEAMS_SKIP tenant=${tenant.slug} requested=${teamCount} skipped=${skipped} (all names already exist)`,
    );
    return;
  }

  console.log(
    `Bulk teams: tenant="${tenant.name}" (${tenant.slug}), add=${data.length}, skip=${skipped}, pool=${poolMax}, batch=${batch}`,
  );

  const result = await prisma.team.createMany({ data });
  const total = await prisma.team.count({ where: { tenantId: tenant.id } });

  console.log(
    `BULK_TEAMS_OK created=${result.count} totalInTenant=${total} (was ${existingBefore})`,
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
