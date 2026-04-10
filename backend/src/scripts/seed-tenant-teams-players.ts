import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Читаемые названия команд (slug остаётся техническим — cleanup по SEED_BATCH не ломается). */
const TEAM_NAMES = [
  'Буревестник',
  'Сокол',
  'Орёл',
  'Медведь',
  'Тайфун',
  'Шторм',
  'Арктика',
  'Волна',
  'Комета',
  'Молния',
  'Олимп',
  'Пионер',
  'Рубин',
  'Сапфир',
  'Изумруд',
  'Гранит',
  'Сталь',
  'Факел',
  'Вихрь',
  'Север',
  'Юг',
  'Восток',
  'Запад',
  'Динамо',
  'Спартаковец',
  'Торпедо',
  'Ракета',
  'Метеор',
  'Цунами',
  'Аврора',
  'Полярник',
  'Ледокол',
  'Штурм',
  'Барс',
  'Рысь',
  'Волк',
  'Беркут',
  'Алмаз',
  'Кристалл',
  'Феникс',
  'Грифон',
  'Пантера',
  'Тигр',
  'Лев',
  'Дракон',
  'Скиф',
  'Русич',
  'Славянин',
  'Витязь',
  'Богатырь',
  'Соколиный',
  'Орлиный',
  'Моряк',
  'Капитан',
  'Штурман',
  'Буревестник Юг',
  'Северный ветер',
  'Красная звезда',
  'Синяя линия',
  'Зелёный мыс',
  'Золотой ключ',
  'Серебряная стрела',
  'Бронзовый щит',
  'Чёрный лебедь',
  'Белый парус',
] as const;

const FIRST_NAMES = [
  'Иван',
  'Алексей',
  'Дмитрий',
  'Сергей',
  'Андрей',
  'Михаил',
  'Николай',
  'Павел',
  'Егор',
  'Максим',
  'Владимир',
  'Артём',
  'Илья',
  'Кирилл',
  'Роман',
  'Олег',
  'Виктор',
  'Константин',
  'Григорий',
  'Степан',
  'Антон',
  'Денис',
  'Евгений',
  'Тимофей',
  'Матвей',
  'Борис',
  'Глеб',
  'Даниил',
  'Ярослав',
  'Семён',
  'Александр',
  'Валерий',
  'Игорь',
  'Лев',
  'Марк',
  'Никита',
  'Пётр',
  'Станислав',
  'Фёдор',
  'Эдуард',
  'Юрий',
  'Анна',
  'Мария',
  'Елена',
  'Ольга',
  'Наталья',
  'Татьяна',
  'Ирина',
  'Светлана',
  'Екатерина',
  'Виктория',
  'Дарья',
  'Полина',
  'София',
] as const;

const LAST_NAMES = [
  'Иванов',
  'Петров',
  'Сидоров',
  'Смирнов',
  'Кузнецов',
  'Попов',
  'Соколов',
  'Лебедев',
  'Козлов',
  'Новиков',
  'Морозов',
  'Волков',
  'Алексеев',
  'Лебедько',
  'Семёнов',
  'Егоров',
  'Павлов',
  'Михайлов',
  'Степанов',
  'Николаев',
  'Орлов',
  'Андреев',
  'Макаров',
  'Никитин',
  'Захаров',
  'Зайцев',
  'Соловьёв',
  'Борисов',
  'Яковлев',
  'Григорьев',
  'Романов',
  'Воробьёв',
  'Сергеев',
  'Фролов',
  'Александров',
  'Дмитриев',
  'Королёв',
  'Гусев',
  'Киселёв',
  'Ильин',
  'Тихонов',
  'Крылов',
  'Тарасов',
  'Белов',
  'Комаров',
  'Орехов',
  'Ширяев',
  'Давыдов',
  'Жуков',
  'Фёдоров',
  'Рыбаков',
  'Голубев',
  'Куликов',
  'Майоров',
  'Баранов',
  'Фомин',
  'Дроздов',
  'Калинин',
  'Антонов',
  'Титов',
  'Карпов',
  'Власов',
  'Мельников',
  'Данилов',
  'Панов',
  'Руднев',
  'Савельев',
  'Ефимов',
  'Терентьев',
] as const;

function toInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Уникальные в рамках прогона отображаемые имена команд при teamsCount > длины пула. */
function teamDisplayNames(count: number): string[] {
  const pool = [...TEAM_NAMES];
  shuffleInPlace(pool);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const base = pool[i % pool.length]!;
    const round = Math.floor(i / pool.length);
    out.push(round === 0 ? base : `${base} (${round + 1})`);
  }
  return out;
}

async function main() {
  const tenantSlug = (process.env.SEED_TENANT_SLUG ?? 'impuls-2')
    .trim()
    .toLowerCase();
  const teamsCount = toInt(process.env.SEED_TEAMS, 20);
  const playersPerTeam = toInt(process.env.SEED_PLAYERS_PER_TEAM, 10);
  const batch = (process.env.SEED_BATCH ?? '').trim() || String(Date.now());

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

  const teamNames = teamDisplayNames(teamsCount);

  let teamsCreated = 0;
  let playersCreated = 0;
  let linksCreated = 0;

  for (let ti = 1; ti <= teamsCount; ti++) {
    const teamSlug = `${tenant.slug}-seed-${batch}-t-${String(ti).padStart(2, '0')}`;
    const team = await prisma.team.create({
      data: {
        tenantId: tenant.id,
        name: teamNames[ti - 1]!,
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
          firstName: pick(FIRST_NAMES),
          lastName: pick(LAST_NAMES),
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
