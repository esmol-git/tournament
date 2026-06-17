import { BadRequestException } from '@nestjs/common';
import {
  PlayerGender,
  Prisma,
  TournamentRegulationMode,
} from '@prisma/client';

const ALL_GENDERS: PlayerGender[] = [PlayerGender.MALE, PlayerGender.FEMALE];

export type EligibilityBounds = {
  label: string;
  requireBirthDate: boolean;
  minBirthYear: number | null;
  maxBirthYear: number | null;
  allowedGenders: PlayerGender[];
};

type PolicyRow = {
  name: string;
  requireBirthDate: boolean;
  minBirthYear: number | null;
  maxBirthYear: number | null;
  allowedGenders: PlayerGender[];
  ageGroup?: {
    name: string;
    minBirthYear: number | null;
    maxBirthYear: number | null;
  } | null;
};

type AgeGroupRow = {
  name: string;
  minBirthYear: number | null;
  maxBirthYear: number | null;
};

export type EligibilityBoundsDb = Pick<
  Prisma.TransactionClient,
  'eligibilityPolicy' | 'ageGroup' | 'tournament'
>;

export type EligibilityDb = EligibilityBoundsDb &
  Pick<Prisma.TransactionClient, 'player'>;

function mergeBoundsFromPolicy(policy: PolicyRow): EligibilityBounds {
  const minYears: number[] = [];
  const maxYears: number[] = [];
  if (policy.minBirthYear != null) minYears.push(policy.minBirthYear);
  if (policy.maxBirthYear != null) maxYears.push(policy.maxBirthYear);
  if (policy.ageGroup?.minBirthYear != null) {
    minYears.push(policy.ageGroup.minBirthYear);
  }
  if (policy.ageGroup?.maxBirthYear != null) {
    maxYears.push(policy.ageGroup.maxBirthYear);
  }
  return {
    label: policy.name,
    requireBirthDate: policy.requireBirthDate,
    minBirthYear: minYears.length ? Math.max(...minYears) : null,
    maxBirthYear: maxYears.length ? Math.min(...maxYears) : null,
    allowedGenders: policy.allowedGenders.length
      ? policy.allowedGenders
      : ALL_GENDERS,
  };
}

function boundsFromAgeGroup(ag: AgeGroupRow): EligibilityBounds {
  return {
    label: ag.name,
    requireBirthDate:
      ag.minBirthYear != null || ag.maxBirthYear != null,
    minBirthYear: ag.minBirthYear,
    maxBirthYear: ag.maxBirthYear,
    allowedGenders: ALL_GENDERS,
  };
}

function assertPlayerAgainstBounds(
  bounds: EligibilityBounds,
  player: {
    birthDate: Date | null;
    gender: PlayerGender | null;
    firstName: string;
    lastName: string;
  },
) {
  const hasYearWindow =
    bounds.minBirthYear != null || bounds.maxBirthYear != null;

  if (bounds.requireBirthDate && !player.birthDate) {
    throw new BadRequestException(
      `У игрока ${player.lastName} ${player.firstName} не указана дата рождения (требуется для «${bounds.label}»)`,
    );
  }

  if (player.birthDate) {
    const y = new Date(player.birthDate).getUTCFullYear();
    if (bounds.minBirthYear != null && y < bounds.minBirthYear) {
      throw new BadRequestException(
        `Игрок не подходит под «${bounds.label}» (год рождения не раньше ${bounds.minBirthYear})`,
      );
    }
    if (bounds.maxBirthYear != null && y > bounds.maxBirthYear) {
      throw new BadRequestException(
        `Игрок не подходит под «${bounds.label}» (год рождения не позже ${bounds.maxBirthYear})`,
      );
    }
  } else if (hasYearWindow) {
    throw new BadRequestException(
      `Для проверки возраста у игрока ${player.lastName} ${player.firstName} нужна дата рождения`,
    );
  }

  if (bounds.allowedGenders.length < ALL_GENDERS.length) {
    if (!player.gender) {
      throw new BadRequestException(
        `Для «${bounds.label}» у игрока ${player.lastName} ${player.firstName} должен быть указан пол`,
      );
    }
    if (!bounds.allowedGenders.includes(player.gender)) {
      throw new BadRequestException(
        `Игрок не подходит под «${bounds.label}» (пол)`,
      );
    }
  }
}

const policySelect = {
  name: true,
  requireBirthDate: true,
  minBirthYear: true,
  maxBirthYear: true,
  allowedGenders: true,
  ageGroup: {
    select: { name: true, minBirthYear: true, maxBirthYear: true },
  },
} as const;

export async function resolveTournamentEligibilityBounds(
  db: EligibilityBoundsDb,
  tenantId: string,
  tournament: {
    id: string;
    ageGroupId: string | null;
    eligibilityPolicyId: string | null;
    regulationMode: TournamentRegulationMode;
    editionId: string | null;
    edition?: {
      eligibilityPolicyId: string | null;
    } | null;
  },
): Promise<EligibilityBounds | null> {
  let edition = tournament.edition;
  if (!edition && tournament.editionId) {
    const tRow = await db.tournament.findFirst({
      where: { id: tournament.id, tenantId },
      select: {
        edition: { select: { eligibilityPolicyId: true } },
      },
    });
    edition = tRow?.edition ?? null;
  }

  const tryPolicyId = (id: string | null | undefined) => id?.trim() || null;

  const policyId =
    tournament.regulationMode === TournamentRegulationMode.OVERRIDE
      ? (tryPolicyId(tournament.eligibilityPolicyId) ??
        tryPolicyId(edition?.eligibilityPolicyId))
      : (tryPolicyId(tournament.eligibilityPolicyId) ??
        tryPolicyId(edition?.eligibilityPolicyId));

  if (policyId) {
    const policy = await db.eligibilityPolicy.findFirst({
      where: { id: policyId, tenantId },
      select: policySelect,
    });
    if (policy) return mergeBoundsFromPolicy(policy);
  }

  if (tournament.ageGroupId) {
    const ag = await db.ageGroup.findFirst({
      where: { id: tournament.ageGroupId, tenantId },
      select: { name: true, minBirthYear: true, maxBirthYear: true },
    });
    if (ag && (ag.minBirthYear != null || ag.maxBirthYear != null)) {
      return boundsFromAgeGroup(ag);
    }
  }

  return null;
}

export async function assertPlayerFitsTournamentEligibility(
  db: EligibilityDb,
  tenantId: string,
  tournament: Parameters<typeof resolveTournamentEligibilityBounds>[2],
  playerId: string,
): Promise<void> {
  const bounds = await resolveTournamentEligibilityBounds(
    db,
    tenantId,
    tournament,
  );
  if (!bounds) return;

  const player = await db.player.findFirst({
    where: { id: playerId, tenantId },
    select: {
      birthDate: true,
      gender: true,
      firstName: true,
      lastName: true,
    },
  });
  if (!player) throw new BadRequestException('Игрок не найден');

  assertPlayerAgainstBounds(bounds, player);
}

export function birthYearWindowsOverlap(
  a: { min: number | null; max: number | null },
  b: { min: number | null; max: number | null },
): boolean {
  const aMin = a.min ?? Number.MIN_SAFE_INTEGER;
  const aMax = a.max ?? Number.MAX_SAFE_INTEGER;
  const bMin = b.min ?? Number.MIN_SAFE_INTEGER;
  const bMax = b.max ?? Number.MAX_SAFE_INTEGER;
  return aMin <= bMax && bMin <= aMax;
}
