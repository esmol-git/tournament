import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreatePlayerDto } from './dto/create-player.dto';
import { PlayersFilterQueryDto } from './dto/players-filter-query.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';
import { csvRow, parseCsv } from './players-csv.util';

@Injectable()
export class PlayersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private async assertCanAssignTeamTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    teamId: string,
    actorUserId: string,
    actorRole: string,
  ): Promise<void> {
    const team = await tx.team.findFirst({
      where: { id: teamId, tenantId },
      select: { id: true },
    });
    if (!team) throw new BadRequestException('Team not found');

    if (actorRole === 'TEAM_ADMIN') {
      const admin = await tx.teamAdmin.findFirst({
        where: { teamId, userId: actorUserId },
        select: { id: true },
      });
      if (!admin) {
        throw new BadRequestException(
          'You can only assign players to teams you manage',
        );
      }
    }
  }

  private async assertPlayerMatchesTeamCategoryTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    teamId: string,
    playerId: string,
  ): Promise<void> {
    const [team, player] = await Promise.all([
      tx.team.findFirst({
        where: { id: teamId, tenantId },
        select: {
          id: true,
          name: true,
          category: true,
        },
      }),
      tx.player.findFirst({
        where: { id: playerId, tenantId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          birthDate: true,
          gender: true,
        },
      }),
    ]);
    if (!team) throw new BadRequestException('Team not found');
    if (!player) throw new BadRequestException('Player not found');
    if (!team.category) return;
    const category = await tx.teamCategory.findFirst({
      where: { tenantId, name: { equals: team.category, mode: 'insensitive' } },
      select: {
        name: true,
        rules: {
          select: {
            type: true,
            minBirthYear: true,
            maxBirthYear: true,
            requireBirthDate: true,
            allowedGenders: true,
          },
        },
      },
    });
    if (!category) return;
    const rules = category.rules;

    for (const rule of rules) {
      if (rule.type === 'AGE') {
        if (rule.requireBirthDate && !player.birthDate) {
          throw new BadRequestException(
              `Player "${player.lastName} ${player.firstName}" has no birth date, but category "${category.name}" requires it`,
          );
        }
        if (rule.minBirthYear != null) {
          if (!player.birthDate) {
            throw new BadRequestException(
              `Player "${player.lastName} ${player.firstName}" has no birth date, but category "${category.name}" requires birth year ${rule.minBirthYear} or younger`,
            );
          }
          if (player.birthDate.getFullYear() < rule.minBirthYear) {
            throw new BadRequestException(
              `Player "${player.lastName} ${player.firstName}" is too old for category "${category.name}". Required birth year: ${rule.minBirthYear}+`,
            );
          }
        }
        if (rule.maxBirthYear != null) {
          if (!player.birthDate) {
            throw new BadRequestException(
              `Player "${player.lastName} ${player.firstName}" has no birth date, but category "${category.name}" requires birth year ${rule.maxBirthYear} or older`,
            );
          }
          if (player.birthDate.getFullYear() > rule.maxBirthYear) {
            throw new BadRequestException(
              `Player "${player.lastName} ${player.firstName}" is too young for category "${category.name}". Max allowed birth year: ${rule.maxBirthYear}`,
            );
          }
        }
      }

      if (rule.type === 'GENDER' && (rule.allowedGenders?.length ?? 0) > 0) {
        if (!player.gender) {
          throw new BadRequestException(
            `Player "${player.lastName} ${player.firstName}" has no gender, but category "${category.name}" has gender restriction`,
          );
        }
        if (!rule.allowedGenders.includes(player.gender)) {
          throw new BadRequestException(
            `Player "${player.lastName} ${player.firstName}" gender "${player.gender}" is not allowed for category "${category.name}"`,
          );
        }
      }
    }
  }

  /** Одна команда на игрока: сбросить состав и при необходимости добавить в команду. */
  private async setPlayerTeamTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    playerId: string,
    teamId: string | null,
    actorUserId: string,
    actorRole: string,
  ): Promise<void> {
    await tx.teamPlayer.deleteMany({ where: { playerId } });
    if (!teamId?.trim()) return;
    const tid = teamId.trim();
    await this.assertCanAssignTeamTx(tx, tenantId, tid, actorUserId, actorRole);
    await this.assertPlayerMatchesTeamCategoryTx(tx, tenantId, tid, playerId);
    await tx.teamPlayer.create({
      data: { teamId: tid, playerId },
    });
  }

  private readonly parseYmdToLocalBoundary = (
    ymd: string,
    endOfDay: boolean,
  ) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      return new Date(
        y,
        mo - 1,
        d,
        endOfDay ? 23 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 999 : 0,
      );
    }

    const dt = new Date(ymd);
    return new Date(
      dt.getFullYear(),
      dt.getMonth(),
      dt.getDate(),
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0,
    );
  };

  private getListWhereAndOrderBy(
    tenantId: string,
    actorUserId: string,
    actorRole: string,
    query: PlayersFilterQueryDto,
  ): { where: Prisma.PlayerWhereInput; orderBy: any } {
    const where: Prisma.PlayerWhereInput = { tenantId };

    const nameTrimmed = query.name?.trim();
    if (nameTrimmed) {
      const tokens = nameTrimmed.split(/\s+/).filter(Boolean);
      const nameAnd: Prisma.PlayerWhereInput[] = tokens.map((token) => ({
        OR: [
          { firstName: { contains: token, mode: 'insensitive' } },
          { lastName: { contains: token, mode: 'insensitive' } },
        ],
      }));
      where.AND = [...(Array.isArray(where.AND) ? where.AND : []), ...nameAnd];
    } else {
      if (query.lastName?.trim()) {
        where.lastName = {
          contains: query.lastName.trim(),
          mode: 'insensitive',
        };
      }
      if (query.firstName?.trim()) {
        where.firstName = {
          contains: query.firstName.trim(),
          mode: 'insensitive',
        };
      }
    }

    if (query.position?.trim()) {
      where.position = { contains: query.position.trim(), mode: 'insensitive' };
    }
    if (query.phone?.trim()) {
      where.phone = { contains: query.phone.trim(), mode: 'insensitive' };
    }

    const dateFrom = query.birthDateFrom
      ? this.parseYmdToLocalBoundary(query.birthDateFrom, false)
      : null;
    const dateTo = query.birthDateTo
      ? this.parseYmdToLocalBoundary(query.birthDateTo, true)
      : null;

    if (dateFrom && Number.isNaN(dateFrom.getTime()))
      throw new BadRequestException('Invalid birthDateFrom');
    if (dateTo && Number.isNaN(dateTo.getTime()))
      throw new BadRequestException('Invalid birthDateTo');
    if (dateFrom && dateTo && dateFrom > dateTo)
      throw new BadRequestException('birthDateFrom must be <= birthDateTo');

    if (dateFrom || dateTo) {
      where.birthDate = {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
    }

    const teamIdFilter = query.teamId?.trim();

    if (actorRole === 'TEAM_ADMIN') {
      where.teamPlayers = {
        some: {
          ...(teamIdFilter ? { teamId: teamIdFilter } : {}),
          team: {
            tenantId,
            admins: {
              some: { userId: actorUserId },
            },
          },
        },
      };
    } else if (teamIdFilter) {
      where.teamPlayers = {
        some: {
          teamId: teamIdFilter,
          team: { tenantId },
        },
      };
    }

    const sortField = query.sortField;
    const sortDir: 'asc' | 'desc' = query.sortOrder === 1 ? 'asc' : 'desc';

    const orderBy: any =
      sortField === 'firstName'
        ? [{ firstName: sortDir }, { id: 'desc' }]
        : sortField === 'lastName'
          ? [{ lastName: sortDir }, { id: 'desc' }]
          : sortField === 'birthDate'
            ? [{ birthDate: sortDir }, { id: 'desc' }]
            : sortField === 'position'
              ? [{ position: sortDir }, { id: 'desc' }]
              : sortField === 'phone'
                ? [{ phone: sortDir }, { id: 'desc' }]
                : [{ createdAt: 'desc' }, { id: 'desc' }];

    return { where, orderBy };
  }

  private formatBirthDateCsv(d: Date | null): string {
    if (!d) return '';
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return '';
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private static readonly CSV_EXPORT_MAX = 20_000;

  async exportCsv(
    tenantId: string,
    actorUserId: string,
    actorRole: string,
    query: PlayersFilterQueryDto,
  ): Promise<{ filename: string; body: string }> {
    const { where, orderBy } = this.getListWhereAndOrderBy(
      tenantId,
      actorUserId,
      actorRole,
      query,
    );

    const players = await this.prisma.player.findMany({
      where,
      orderBy,
      take: PlayersService.CSV_EXPORT_MAX,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        gender: true,
        position: true,
        phone: true,
        bioNumber: true,
        biography: true,
        photoUrl: true,
        teamPlayers: {
          take: 1,
          select: {
            team: { select: { id: true, name: true } },
          },
        },
      },
    });

    const header = csvRow([
      'id',
      'lastName',
      'firstName',
      'birthDate',
      'gender',
      'position',
      'phone',
      'bioNumber',
      'teamId',
      'teamName',
      'biography',
      'photoUrl',
    ]);

    const lines = [header];
    for (const p of players) {
      const team = p.teamPlayers[0]?.team;
      lines.push(
        csvRow([
          p.id,
          p.lastName,
          p.firstName,
          this.formatBirthDateCsv(p.birthDate),
          p.gender ?? '',
          p.position ?? '',
          p.phone ?? '',
          p.bioNumber ?? '',
          team?.id ?? '',
          team?.name ?? '',
          p.biography ?? '',
          p.photoUrl ?? '',
        ]),
      );
    }

    const bom = '\uFEFF';
    return {
      filename: 'players-export.csv',
      body: bom + lines.join('\r\n'),
    };
  }

  private normalizeCsvHeaderKey(raw: string): string {
    return raw
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '');
  }

  private buildCsvHeaderMap(headerRow: string[]): Map<string, number> {
    const aliases: Record<string, string> = {
      id: 'id',
      lastname: 'lastName',
      firstname: 'firstName',
      birthdate: 'birthDate',
      gender: 'gender',
      position: 'position',
      phone: 'phone',
      bionumber: 'bioNumber',
      teamid: 'teamId',
      teamname: 'teamName',
      biography: 'biography',
      photourl: 'photoUrl',
      фамилия: 'lastName',
      имя: 'firstName',
      датарождения: 'birthDate',
      пол: 'gender',
      амплуа: 'position',
      телефон: 'phone',
      номеригрока: 'bioNumber',
      '№': 'bioNumber',
      команданазвание: 'teamName',
      команда: 'teamName',
      идкоманды: 'teamId',
    };

    const map = new Map<string, number>();
    headerRow.forEach((cell, i) => {
      const k = this.normalizeCsvHeaderKey(cell);
      const canon = aliases[k] ?? k;
      if (!map.has(canon)) map.set(canon, i);
    });
    return map;
  }

  private cellAt(row: string[], map: Map<string, number>, key: string): string {
    const i = map.get(key);
    if (i === undefined || i < 0 || i >= row.length) return '';
    return row[i]?.trim() ?? '';
  }

  /** Значение ячейки пола: MALE/FEMALE или рус. «Мужской» / «Женский» (как в Excel). */
  private normalizeGenderForCsv(raw: string): 'MALE' | 'FEMALE' | undefined {
    const t = raw.trim();
    if (!t) return undefined;
    const up = t.toUpperCase();
    if (up === 'MALE' || up === 'FEMALE') return up;
    const lower = t.toLowerCase();
    if (lower === 'мужской' || lower === 'м') return 'MALE';
    if (lower === 'женский' || lower === 'ж') return 'FEMALE';
    return undefined;
  }

  private async resolveTeamIdForCsv(
    tenantId: string,
    teamIdRaw: string,
    teamNameRaw: string,
  ): Promise<string | undefined> {
    const tid = teamIdRaw?.trim();
    if (tid) return tid;
    const name = teamNameRaw?.trim();
    if (!name) return undefined;
    const t = await this.prisma.team.findFirst({
      where: { tenantId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    return t?.id;
  }

  /**
   * Режим импорта CSV (query `mode`):
   * - upsert — по умолчанию: есть id и игрок найден → обновить; иначе создать;
   * - createOnly — создавать только строки без id; строки с id пропускаются;
   * - updateOnly — обновлять только строки с id, если игрок есть; остальное пропускается.
   */
  private parseImportMode(raw?: string): 'upsert' | 'createOnly' | 'updateOnly' {
    const t = raw?.trim();
    if (t === 'createOnly') return 'createOnly';
    if (t === 'updateOnly') return 'updateOnly';
    if (t === 'upsert' || t === undefined || t === '') return 'upsert';
    throw new BadRequestException(
      'Параметр mode: допустимо upsert, createOnly или updateOnly',
    );
  }

  async importCsv(
    tenantId: string,
    actorUserId: string,
    actorRole: string,
    csvText: string,
    modeRaw?: string,
  ): Promise<{
    created: number;
    updated: number;
    skipped: number;
    errors: Array<{ row: number; message: string }>;
  }> {
    const mode = this.parseImportMode(modeRaw);
    const rows = parseCsv(csvText.trim());
    if (rows.length < 2) {
      throw new BadRequestException(
        'CSV: нужна строка заголовков и хотя бы одна строка данных',
      );
    }

    const headerMap = this.buildCsvHeaderMap(rows[0]);
    if (
      headerMap.get('lastName') === undefined ||
      headerMap.get('firstName') === undefined
    ) {
      throw new BadRequestException(
        'CSV: обязательные колонки lastName и firstName (или «Фамилия», «Имя»)',
      );
    }

    const errors: Array<{ row: number; message: string }> = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (row.every((c) => !String(c).trim())) continue;

      const lastName = this.cellAt(row, headerMap, 'lastName');
      const firstName = this.cellAt(row, headerMap, 'firstName');
      if (!lastName || !firstName) {
        errors.push({ row: r + 1, message: 'Пустые lastName или firstName' });
        continue;
      }

      const id = this.cellAt(row, headerMap, 'id');
      const birthDate = this.cellAt(row, headerMap, 'birthDate') || undefined;
      const gender = this.normalizeGenderForCsv(
        this.cellAt(row, headerMap, 'gender'),
      );
      const position = this.cellAt(row, headerMap, 'position') || undefined;
      const phone = this.cellAt(row, headerMap, 'phone') || undefined;
      const bioNumber = this.cellAt(row, headerMap, 'bioNumber') || undefined;
      const biography = this.cellAt(row, headerMap, 'biography') || undefined;
      const photoUrlRaw = this.cellAt(row, headerMap, 'photoUrl');
      const photoUrl =
        photoUrlRaw === '' ? undefined : photoUrlRaw || undefined;

      let teamIdResolved: string | undefined;
      try {
        teamIdResolved = await this.resolveTeamIdForCsv(
          tenantId,
          this.cellAt(row, headerMap, 'teamId'),
          this.cellAt(row, headerMap, 'teamName'),
        );
      } catch {
        errors.push({ row: r + 1, message: 'Не удалось сопоставить команду' });
        continue;
      }

      const hasTeamCols = headerMap.has('teamId') || headerMap.has('teamName');
      const teamIdForCreate = teamIdResolved?.trim() || undefined;
      let teamIdForUpdate: string | null | undefined = undefined;
      if (hasTeamCols) {
        teamIdForUpdate = teamIdResolved?.trim() ? teamIdResolved.trim() : null;
      }

      try {
        if (mode === 'createOnly' && id) {
          skipped++;
          continue;
        }
        if (mode === 'updateOnly' && !id) {
          skipped++;
          continue;
        }

        if (id) {
          const existing = await this.prisma.player.findFirst({
            where: { id, tenantId },
            select: { id: true },
          });
          if (existing) {
            await this.update(tenantId, id, actorUserId, actorRole, {
              lastName,
              firstName,
              birthDate,
              gender,
              position,
              phone,
              bioNumber,
              biography,
              photoUrl,
              ...(hasTeamCols ? { teamId: teamIdForUpdate } : {}),
            });
            updated++;
          } else if (mode === 'updateOnly') {
            skipped++;
          } else {
            await this.create(tenantId, actorUserId, actorRole, {
              lastName,
              firstName,
              birthDate,
              gender,
              position,
              phone,
              bioNumber,
              biography,
              photoUrl,
              teamId: teamIdForCreate,
            });
            created++;
          }
        } else {
          await this.create(tenantId, actorUserId, actorRole, {
            lastName,
            firstName,
            birthDate,
            gender,
            position,
            phone,
            bioNumber,
            biography,
            photoUrl,
            teamId: teamIdForCreate,
          });
          created++;
        }
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        errors.push({ row: r + 1, message: msg });
      }
    }

    return { created, updated, skipped, errors };
  }

  async list(
    tenantId: string,
    actorUserId: string,
    actorRole: string,
    query: PlayersFilterQueryDto,
  ) {
    const { where, orderBy } = this.getListWhereAndOrderBy(
      tenantId,
      actorUserId,
      actorRole,
      query,
    );

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const total = await this.prisma.player.count({ where });
    const players = await this.prisma.player.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        gender: true,
        position: true,
        phone: true,
        bioNumber: true,
        biography: true,
        photoUrl: true,
        teamPlayers: {
          take: 1,
          select: {
            team: {
              select: { id: true, name: true, logoUrl: true },
            },
          },
        },
      },
    });

    return {
      items: players.map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        birthDate: p.birthDate,
        gender: p.gender,
        position: p.position,
        phone: p.phone,
        bioNumber: p.bioNumber,
        biography: p.biography,
        photoUrl: p.photoUrl,
        team: p.teamPlayers[0]?.team ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  async create(
    tenantId: string,
    actorUserId: string,
    actorRole: string,
    dto: CreatePlayerDto,
  ) {
    const birthDate = dto.birthDate
      ? this.parseYmdToLocalBoundary(dto.birthDate, false)
      : null;

    if (birthDate && Number.isNaN(birthDate.getTime()))
      throw new BadRequestException('Invalid birthDate');

    const photoUrlCreate =
      dto.photoUrl === undefined || dto.photoUrl === ''
        ? undefined
        : dto.photoUrl;

    const teamIdTrimmed = dto.teamId?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.create({
        data: {
          tenantId,
          lastName: dto.lastName,
          firstName: dto.firstName,
          birthDate: birthDate ?? undefined,
          gender: dto.gender ?? undefined,
          position: dto.position ?? undefined,
          phone: dto.phone ?? undefined,
          bioNumber: dto.bioNumber ?? undefined,
          biography: dto.biography ?? undefined,
          photoUrl: photoUrlCreate,
        },
      });
      if (teamIdTrimmed) {
        await this.setPlayerTeamTx(
          tx,
          tenantId,
          player.id,
          teamIdTrimmed,
          actorUserId,
          actorRole,
        );
      }
      return player;
    });
  }

  async update(
    tenantId: string,
    id: string,
    actorUserId: string,
    actorRole: string,
    dto: UpdatePlayerDto,
  ) {
    const player = await this.prisma.player.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        birthDate: true,
        gender: true,
        lastName: true,
        firstName: true,
        position: true,
        phone: true,
        bioNumber: true,
        biography: true,
        photoUrl: true,
      },
    });
    if (!player) throw new NotFoundException('Player not found');

    const birthDate = dto.birthDate
      ? this.parseYmdToLocalBoundary(dto.birthDate, false)
      : undefined;
    if (dto.birthDate && birthDate && Number.isNaN(birthDate.getTime()))
      throw new BadRequestException('Invalid birthDate');

    const photoUrlResolved =
      dto.photoUrl === undefined
        ? undefined
        : dto.photoUrl === null || dto.photoUrl === ''
          ? null
          : dto.photoUrl;

    const previousPhotoUrl = player.photoUrl;
    const removeOldPhotoFromS3 =
      !!previousPhotoUrl &&
      photoUrlResolved !== undefined &&
      (photoUrlResolved === null || photoUrlResolved !== previousPhotoUrl);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.player.update({
        where: { id },
        data: {
          lastName: dto.lastName ?? player.lastName,
          firstName: dto.firstName ?? player.firstName,
          birthDate: birthDate !== undefined ? birthDate : player.birthDate,
          gender: dto.gender !== undefined ? dto.gender : player.gender,
          position: dto.position !== undefined ? dto.position : player.position,
          phone: dto.phone !== undefined ? dto.phone : player.phone,
          bioNumber:
            dto.bioNumber !== undefined ? dto.bioNumber : player.bioNumber,
          biography:
            dto.biography !== undefined ? dto.biography : player.biography,
          photoUrl:
            photoUrlResolved !== undefined ? photoUrlResolved : player.photoUrl,
        },
      });
      if (dto.teamId !== undefined) {
        await this.setPlayerTeamTx(
          tx,
          tenantId,
          id,
          dto.teamId,
          actorUserId,
          actorRole,
        );
      }
      return row;
    });

    if (removeOldPhotoFromS3 && previousPhotoUrl) {
      await this.storage.tryDeletePublicUrl(previousPhotoUrl);
    }

    return updated;
  }

  async delete(tenantId: string, id: string) {
    const player = await this.prisma.player.findFirst({
      where: { id, tenantId },
      select: { id: true, photoUrl: true },
    });
    if (!player) throw new NotFoundException('Player not found');

    const photoToRemove = player.photoUrl;

    await this.prisma.$transaction(async (tx) => {
      await tx.teamPlayer.deleteMany({ where: { playerId: id } });
      await tx.player.delete({ where: { id } });
    });

    if (photoToRemove) {
      await this.storage.tryDeletePublicUrl(photoToRemove);
    }

    return { success: true };
  }
}
