import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type AgeGroupAssertDb = Pick<Prisma.TransactionClient, 'ageGroup' | 'player'>;

/**
 * Проверка года рождения игрока против границ возрастной группы турнира.
 */
export async function assertPlayerFitsAgeGroup(
  db: AgeGroupAssertDb,
  tenantId: string,
  ageGroupId: string,
  playerId: string,
): Promise<void> {
  const ageGroup = await db.ageGroup.findFirst({
    where: { id: ageGroupId, tenantId },
    select: {
      id: true,
      name: true,
      minBirthYear: true,
      maxBirthYear: true,
    },
  });
  if (!ageGroup) {
    throw new BadRequestException('Возрастная группа турнира не найдена');
  }
  if (ageGroup.minBirthYear == null && ageGroup.maxBirthYear == null) {
    return;
  }

  const player = await db.player.findFirst({
    where: { id: playerId, tenantId },
    select: { birthDate: true, firstName: true, lastName: true },
  });
  if (!player) {
    throw new BadRequestException('Игрок не найден');
  }
  if (!player.birthDate) {
    throw new BadRequestException(
      `У игрока ${player.lastName} ${player.firstName} не указана дата рождения (требуется для ${ageGroup.name})`,
    );
  }

  const y = new Date(player.birthDate).getUTCFullYear();
  if (ageGroup.minBirthYear != null && y < ageGroup.minBirthYear) {
    throw new BadRequestException(
      `Игрок не подходит под возрастную группу «${ageGroup.name}» (год рождения не раньше ${ageGroup.minBirthYear})`,
    );
  }
  if (ageGroup.maxBirthYear != null && y > ageGroup.maxBirthYear) {
    throw new BadRequestException(
      `Игрок не подходит под возрастную группу «${ageGroup.name}» (год рождения не позже ${ageGroup.maxBirthYear})`,
    );
  }
}
