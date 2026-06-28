import 'dotenv/config';
import { PlayerGender, Prisma } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import {
  PLAYER_SEED_FIRST_NAMES_UNIQ,
  PLAYER_SEED_LAST_NAMES_UNIQ,
  PLAYER_SEED_POSITIONS,
} from './player-seed-names.util';

const prisma = new PrismaClient();

const BATCH_SIZE = 400;

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

function parseBirthYearRange(raw: string | undefined): { min: number; max: number } {
  const s = raw?.trim() || '1960-2020';
  const m = s.match(/^(\d{4})(?:-(\d{4}))?$/);
  if (!m) {
    throw new Error(
      `Invalid SEED_PLAYER_BIRTH_YEAR="${raw}". Use 2018 or 1960-2020`,
    );
  }
  const y1 = Number(m[1]);
  const y2 = m[2] ? Number(m[2]) : y1;
  if (!Number.isInteger(y1) || !Number.isInteger(y2) || y2 < y1) {
    throw new Error(
      `Invalid SEED_PLAYER_BIRTH_YEAR="${raw}". End year must be >= start year.`,
    );
  }
  if (y1 < 1900 || y2 > 2100) {
    throw new Error('SEED_PLAYER_BIRTH_YEAR years must be between 1900 and 2100.');
  }
  return { min: y1, max: y2 };
}

function randomBirthDate(range: { min: number; max: number }, rng: () => number): Date {
  const year =
    range.min + Math.floor(rng() * (range.max - range.min + 1));
  const t0 = Date.UTC(year, 0, 1);
  const t1 = Date.UTC(year + 1, 0, 1);
  return new Date(t0 + Math.floor(rng() * (t1 - t0)));
}

type NamePair = { firstName: string; lastName: string };

function buildUniqueNamePairs(count: number, rng: () => number): NamePair[] {
  const maxUnique =
    PLAYER_SEED_FIRST_NAMES_UNIQ.length * PLAYER_SEED_LAST_NAMES_UNIQ.length;
  if (count > maxUnique) {
    throw new Error(
      `Cannot generate ${count} unique name pairs (max ${maxUnique}). Lower SEED_PLAYER_COUNT.`,
    );
  }

  const all: NamePair[] = [];
  for (const firstName of PLAYER_SEED_FIRST_NAMES_UNIQ) {
    for (const lastName of PLAYER_SEED_LAST_NAMES_UNIQ) {
      all.push({ firstName, lastName });
    }
  }
  shuffleInPlace(all, rng);
  return all.slice(0, count);
}

function buildProfiles(
  count: number,
  birthRange: { min: number; max: number },
  seed: number,
): Array<{
  firstName: string;
  lastName: string;
  birthDate: Date;
  gender: PlayerGender;
  position: string;
  bioNumber: string;
}> {
  const rng = makeRng(seed);
  const names = buildUniqueNamePairs(count, rng);

  return names.map((name) => ({
    firstName: name.firstName,
    lastName: name.lastName,
    birthDate: randomBirthDate(birthRange, rng),
    gender: PlayerGender.MALE,
    position:
      PLAYER_SEED_POSITIONS[
        Math.floor(rng() * PLAYER_SEED_POSITIONS.length)
      ]!,
    bioNumber: String(1 + Math.floor(rng() * 99)),
  }));
}

async function main() {
  const tenantSlug = (process.env.SEED_TENANT_SLUG ?? 'yaff').trim().toLowerCase();
  const playerCount = toInt(process.env.SEED_PLAYER_COUNT, 3000);
  const birthYearRange = parseBirthYearRange(process.env.SEED_PLAYER_BIRTH_YEAR);
  const seed = toInt(process.env.SEED_RANDOM, Date.now() % 1_000_000_000);

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) {
    throw new Error(`Tenant not found: slug="${tenantSlug}"`);
  }

  const existing = await prisma.player.count({ where: { tenantId: tenant.id } });

  console.log(
    `Bulk players: tenant="${tenant.name}" (${tenant.slug}), add=${playerCount}, existing=${existing}, birth=${birthYearRange.min}-${birthYearRange.max}, gender=MALE, namePool=${PLAYER_SEED_FIRST_NAMES_UNIQ.length}×${PLAYER_SEED_LAST_NAMES_UNIQ.length}`,
  );

  const profiles = buildProfiles(playerCount, birthYearRange, seed);
  let created = 0;

  for (let offset = 0; offset < profiles.length; offset += BATCH_SIZE) {
    const chunk = profiles.slice(offset, offset + BATCH_SIZE);
    const data: Prisma.PlayerCreateManyInput[] = chunk.map((p) => ({
      tenantId: tenant.id,
      firstName: p.firstName,
      lastName: p.lastName,
      birthDate: p.birthDate,
      gender: p.gender,
      position: p.position,
      bioNumber: p.bioNumber,
      isActive: true,
    }));

    const result = await prisma.player.createMany({ data });
    created += result.count;
    console.log(`  batch ${Math.floor(offset / BATCH_SIZE) + 1}: +${result.count}`);
  }

  const total = await prisma.player.count({ where: { tenantId: tenant.id } });
  console.log(`BULK_PLAYERS_OK created=${created} totalInTenant=${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
