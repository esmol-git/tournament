import { Prisma } from '@prisma/client';
import {
  birthYearWindowsOverlap,
  resolveTournamentEligibilityBounds,
  type EligibilityBoundsDb,
} from './eligibility-policy.util';

type WarnDb = Pick<
  Prisma.TransactionClient,
  'tournament' | 'team' | 'teamCategory' | 'ageGroup' | 'eligibilityPolicy'
> &
  EligibilityBoundsDb;

export async function getEligibilityWarningsForTeamTournament(
  db: WarnDb,
  tenantId: string,
  tournamentId: string,
  teamId: string,
): Promise<string[]> {
  const warnings: string[] = [];

  const tournament = await db.tournament.findFirst({
    where: { id: tournamentId, tenantId },
    select: {
      id: true,
      name: true,
      ageGroupId: true,
      eligibilityPolicyId: true,
      regulationMode: true,
      editionId: true,
      ageGroup: {
        select: { id: true, name: true, minBirthYear: true, maxBirthYear: true },
      },
      edition: {
        select: {
          eligibilityPolicyId: true,
        },
      },
    },
  });
  if (!tournament) return warnings;

  const team = await db.team.findFirst({
    where: { id: teamId, tenantId },
    select: {
      name: true,
      ageGroupId: true,
      ageGroup: {
        select: { id: true, name: true, minBirthYear: true, maxBirthYear: true },
      },
      teamCategoryId: true,
      teamCategory: {
        select: {
          name: true,
          minBirthYear: true,
          maxBirthYear: true,
          ageGroupId: true,
          ageGroup: {
            select: { name: true, minBirthYear: true, maxBirthYear: true },
          },
        },
      },
    },
  });
  if (!team) return warnings;

  if (
    tournament.ageGroupId &&
    team.ageGroupId &&
    tournament.ageGroupId !== team.ageGroupId
  ) {
    warnings.push(
      `Возрастная группа команды «${team.ageGroup?.name ?? '—'}» не совпадает с турниром «${tournament.ageGroup?.name ?? '—'}».`,
    );
  }

  const tournamentBounds = await resolveTournamentEligibilityBounds(
    db,
    tenantId,
    tournament,
  );

  if (team.teamCategory) {
    const cat = team.teamCategory;
    const catMinYears: number[] = [];
    const catMaxYears: number[] = [];
    if (cat.minBirthYear != null) catMinYears.push(cat.minBirthYear);
    if (cat.maxBirthYear != null) catMaxYears.push(cat.maxBirthYear);
    if (cat.ageGroup?.minBirthYear != null) {
      catMinYears.push(cat.ageGroup.minBirthYear);
    }
    if (cat.ageGroup?.maxBirthYear != null) {
      catMaxYears.push(cat.ageGroup.maxBirthYear);
    }
    const catWindow = {
      min: catMinYears.length ? Math.max(...catMinYears) : null,
      max: catMaxYears.length ? Math.min(...catMaxYears) : null,
    };

    if (tournamentBounds) {
      const tWindow = {
        min: tournamentBounds.minBirthYear,
        max: tournamentBounds.maxBirthYear,
      };
      if (
        (catWindow.min != null || catWindow.max != null) &&
        (tWindow.min != null || tWindow.max != null) &&
        !birthYearWindowsOverlap(
          { min: catWindow.min, max: catWindow.max },
          { min: tWindow.min, max: tWindow.max },
        )
      ) {
        warnings.push(
          `Категория команды «${cat.name}» и регламент турнира задают несовместимые годы рождения — заявки игроков могут отклоняться.`,
        );
      }
    }
  }

  return warnings;
}
