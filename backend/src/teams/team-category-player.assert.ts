import { BadRequestException } from '@nestjs/common';
import { PlayerGender, Prisma, TeamCategoryType } from '@prisma/client';

const ALL_GENDERS: PlayerGender[] = [PlayerGender.MALE, PlayerGender.FEMALE];

/** Достаточно для findFirst по teamCategory / player (в т.ч. внутри $transaction). */
export type TeamCategoryAssertDb = Pick<
  Prisma.TransactionClient,
  'teamCategory' | 'player'
>;

/**
 * Проверка игрока против правил категории команды (справочник + доп. правила).
 */
export async function assertPlayerFitsTeamCategory(
  db: TeamCategoryAssertDb,
  tenantId: string,
  teamCategoryId: string,
  playerId: string,
): Promise<void> {
  const category = await db.teamCategory.findFirst({
    where: { id: teamCategoryId, tenantId },
    include: { rules: true },
  });
  if (!category) {
    throw new BadRequestException(
      'Категория команды не найдена (проверьте справочник и привязку команды)',
    );
  }

  const player = await db.player.findFirst({
    where: { id: playerId, tenantId },
    select: { birthDate: true, gender: true },
  });
  if (!player) {
    throw new BadRequestException('Игрок не найден');
  }

  const minYears: number[] = [];
  const maxYears: number[] = [];
  if (category.minBirthYear != null) minYears.push(category.minBirthYear);
  if (category.maxBirthYear != null) maxYears.push(category.maxBirthYear);

  const requireBirth =
    category.requireBirthDate || category.rules.some((r) => r.requireBirthDate);

  let genderAllow = new Set<PlayerGender>(
    category.allowedGenders.length ? category.allowedGenders : ALL_GENDERS,
  );

  for (const r of category.rules) {
    if (r.type === TeamCategoryType.AGE) {
      if (r.minBirthYear != null) minYears.push(r.minBirthYear);
      if (r.maxBirthYear != null) maxYears.push(r.maxBirthYear);
    }
    if (r.type === TeamCategoryType.GENDER && r.allowedGenders.length > 0) {
      const ruleSet = new Set(r.allowedGenders);
      genderAllow = new Set([...genderAllow].filter((g) => ruleSet.has(g)));
    }
  }

  const effMin = minYears.length ? Math.max(...minYears) : null;
  const effMax = maxYears.length ? Math.min(...maxYears) : null;
  const hasYearWindow = effMin !== null || effMax !== null;

  if (requireBirth && !player.birthDate) {
    throw new BadRequestException(
      'Для этой категории команды у игрока должна быть указана дата рождения',
    );
  }

  if (player.birthDate) {
    const y = new Date(player.birthDate).getUTCFullYear();
    if (effMin !== null && y < effMin) {
      throw new BadRequestException(
        `Игрок не подходит под категорию команды (год рождения не раньше ${effMin})`,
      );
    }
    if (effMax !== null && y > effMax) {
      throw new BadRequestException(
        `Игрок не подходит под категорию команды (год рождения не позже ${effMax})`,
      );
    }
  } else if (hasYearWindow) {
    throw new BadRequestException(
      'Для проверки возраста у игрока должна быть указана дата рождения',
    );
  }

  if (genderAllow.size < ALL_GENDERS.length) {
    if (!player.gender) {
      throw new BadRequestException(
        'Для этой категории команды у игрока должен быть указан пол',
      );
    }
    if (!genderAllow.has(player.gender)) {
      throw new BadRequestException(
        'Игрок не подходит под категорию команды (пол)',
      );
    }
  }
}
