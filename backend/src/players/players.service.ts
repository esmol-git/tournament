import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { assertPlayerFitsTeamCategory } from '../teams/team-category-player.assert';
import { CreatePlayerDto } from './dto/create-player.dto';
import { PlayersFilterQueryDto } from './dto/players-filter-query.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';
import { csvRow, parseCsv } from './players-csv.util';
import * as XLSX from 'xlsx';

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
    const teamRow = await tx.team.findFirst({
      where: { id: tid, tenantId },
      select: { teamCategoryId: true },
    });
    if (teamRow?.teamCategoryId) {
      await assertPlayerFitsTeamCategory(
        tx,
        tenantId,
        teamRow.teamCategoryId,
        playerId,
      );
    }
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
  private static readonly XLSX_EXPORT_MAX = 20_000;
  private static readonly IMPORT_HEADERS = [
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
  ];
  private static readonly IMPORT_FIELD_KEYS = [
    'lastName',
    'firstName',
    'birthDate',
    'gender',
    'position',
    'phone',
    'bioNumber',
    'team',
    'biography',
    'photoUrl',
  ] as const;

  private isImportFieldKey(
    value: string,
  ): value is (typeof PlayersService.IMPORT_FIELD_KEYS)[number] {
    return (PlayersService.IMPORT_FIELD_KEYS as readonly string[]).includes(
      value,
    );
  }

  private toXlsxRows(
    players: Array<{
      id: string;
      lastName: string;
      firstName: string;
      birthDate: Date | null;
      gender: string | null;
      position: string | null;
      phone: string | null;
      bioNumber: string | null;
      biography: string | null;
      photoUrl: string | null;
      teamPlayers: Array<{ team: { id: string; name: string } | null }>;
    }>,
  ): Record<string, string>[] {
    return players.map((p) => {
      const team = p.teamPlayers[0]?.team;
      return {
        id: p.id,
        lastName: p.lastName ?? '',
        firstName: p.firstName ?? '',
        birthDate: this.formatBirthDateCsv(p.birthDate),
        gender: p.gender ?? '',
        position: p.position ?? '',
        phone: p.phone ?? '',
        bioNumber: p.bioNumber ?? '',
        teamId: team?.id ?? '',
        teamName: team?.name ?? '',
        biography: p.biography ?? '',
        photoUrl: p.photoUrl ?? '',
      };
    });
  }

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

  async exportXlsx(
    tenantId: string,
    actorUserId: string,
    actorRole: string,
    query: PlayersFilterQueryDto,
  ): Promise<{ filename: string; body: Buffer }> {
    const { where, orderBy } = this.getListWhereAndOrderBy(
      tenantId,
      actorUserId,
      actorRole,
      query,
    );

    const players = await this.prisma.player.findMany({
      where,
      orderBy,
      take: PlayersService.XLSX_EXPORT_MAX,
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

    const dataRows = this.toXlsxRows(players);
    const ws = XLSX.utils.json_to_sheet(dataRows, {
      header: PlayersService.IMPORT_HEADERS,
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Players');
    const body = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    return {
      filename: 'players-export.xlsx',
      body,
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
  private parseImportMode(
    raw?: string,
  ): 'upsert' | 'createOnly' | 'updateOnly' {
    const t = raw?.trim();
    if (t === 'createOnly') return 'createOnly';
    if (t === 'updateOnly') return 'updateOnly';
    if (t === 'upsert' || t === undefined || t === '') return 'upsert';
    throw new BadRequestException(
      'Параметр mode: допустимо upsert, createOnly или updateOnly',
    );
  }

  private parseImportFields(
    raw?: string,
  ): Set<(typeof PlayersService.IMPORT_FIELD_KEYS)[number]> {
    if (!raw?.trim()) {
      return new Set(PlayersService.IMPORT_FIELD_KEYS);
    }

    const selected = raw
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

    if (!selected.length) {
      throw new BadRequestException(
        'Параметр fields: укажите хотя бы одно поле импорта',
      );
    }

    const invalid = selected.filter((x) => !this.isImportFieldKey(x));
    if (invalid.length) {
      throw new BadRequestException(
        `Параметр fields: недопустимые значения (${invalid.join(', ')}). Допустимо: ${PlayersService.IMPORT_FIELD_KEYS.join(', ')}`,
      );
    }

    return new Set(
      selected as Array<(typeof PlayersService.IMPORT_FIELD_KEYS)[number]>,
    );
  }

  private normalizeImportCellValue(value: unknown): string {
    if (value == null) return '';
    if (value instanceof Date) return this.formatBirthDateCsv(value);
    if (typeof value === 'number')
      return Number.isFinite(value) ? String(value) : '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value).trim();
  }

  private toStringMatrix(rows: unknown[][]): string[][] {
    return rows.map((row) =>
      row.map((cell) => this.normalizeImportCellValue(cell)),
    );
  }

  private buildImportError(
    row: number,
    message: string,
    field?: string,
    code?: string,
    value?: string,
  ) {
    return {
      row,
      message,
      ...(field ? { field } : {}),
      ...(code ? { code } : {}),
      ...(value !== undefined ? { value } : {}),
    };
  }

  private async importRows(
    tenantId: string,
    actorUserId: string,
    actorRole: string,
    rows: string[][],
    modeRaw?: string,
    fieldsRaw?: string,
  ): Promise<{
    created: number;
    updated: number;
    skipped: number;
    errors: Array<{
      row: number;
      message: string;
      field?: string;
      code?: string;
      value?: string;
    }>;
  }> {
    const mode = this.parseImportMode(modeRaw);
    const fields = this.parseImportFields(fieldsRaw);
    if (rows.length < 2) {
      throw new BadRequestException(
        'CSV/XLSX: нужна строка заголовков и хотя бы одна строка данных',
      );
    }

    const headerMap = this.buildCsvHeaderMap(rows[0]);
    if (mode !== 'updateOnly' && !fields.has('lastName')) {
      throw new BadRequestException(
        'Для createOnly/upsert поле lastName должно быть включено в fields',
      );
    }
    if (mode !== 'updateOnly' && !fields.has('firstName')) {
      throw new BadRequestException(
        'Для createOnly/upsert поле firstName должно быть включено в fields',
      );
    }
    if (mode === 'updateOnly' && headerMap.get('id') === undefined) {
      throw new BadRequestException(
        'Для режима updateOnly нужна колонка id в CSV/XLSX',
      );
    }

    const requiredMissing: string[] = [];
    if (fields.has('lastName') && headerMap.get('lastName') === undefined) {
      requiredMissing.push('lastName');
    }
    if (fields.has('firstName') && headerMap.get('firstName') === undefined) {
      requiredMissing.push('firstName');
    }
    if (fields.has('birthDate') && headerMap.get('birthDate') === undefined) {
      requiredMissing.push('birthDate');
    }
    if (fields.has('gender') && headerMap.get('gender') === undefined) {
      requiredMissing.push('gender');
    }
    if (fields.has('position') && headerMap.get('position') === undefined) {
      requiredMissing.push('position');
    }
    if (fields.has('phone') && headerMap.get('phone') === undefined) {
      requiredMissing.push('phone');
    }
    if (fields.has('bioNumber') && headerMap.get('bioNumber') === undefined) {
      requiredMissing.push('bioNumber');
    }
    if (
      fields.has('team') &&
      headerMap.get('teamId') === undefined &&
      headerMap.get('teamName') === undefined
    ) {
      requiredMissing.push('teamId/teamName');
    }
    if (fields.has('biography') && headerMap.get('biography') === undefined) {
      requiredMissing.push('biography');
    }
    if (fields.has('photoUrl') && headerMap.get('photoUrl') === undefined) {
      requiredMissing.push('photoUrl');
    }
    if (requiredMissing.length) {
      throw new BadRequestException(
        `CSV/XLSX: не найдены обязательные колонки для выбранных fields: ${requiredMissing.join(', ')}`,
      );
    }

    const errors: Array<{
      row: number;
      message: string;
      field?: string;
      code?: string;
      value?: string;
    }> = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (row.every((c) => !String(c).trim())) continue;

      const id = this.cellAt(row, headerMap, 'id');
      try {
        if (mode === 'createOnly' && id) {
          skipped++;
          continue;
        }
        if (mode === 'updateOnly' && !id) {
          skipped++;
          continue;
        }

        const lastName = fields.has('lastName')
          ? this.cellAt(row, headerMap, 'lastName')
          : undefined;
        const firstName = fields.has('firstName')
          ? this.cellAt(row, headerMap, 'firstName')
          : undefined;
        const birthDate = fields.has('birthDate')
          ? this.cellAt(row, headerMap, 'birthDate') || undefined
          : undefined;
        const genderRaw = fields.has('gender')
          ? this.cellAt(row, headerMap, 'gender')
          : '';
        const gender = fields.has('gender')
          ? this.normalizeGenderForCsv(genderRaw)
          : undefined;
        const position = fields.has('position')
          ? this.cellAt(row, headerMap, 'position') || undefined
          : undefined;
        const phone = fields.has('phone')
          ? this.cellAt(row, headerMap, 'phone') || undefined
          : undefined;
        const bioNumber = fields.has('bioNumber')
          ? this.cellAt(row, headerMap, 'bioNumber') || undefined
          : undefined;
        const biography = fields.has('biography')
          ? this.cellAt(row, headerMap, 'biography') || undefined
          : undefined;
        const photoUrlRaw = fields.has('photoUrl')
          ? this.cellAt(row, headerMap, 'photoUrl')
          : '';
        const photoUrl = fields.has('photoUrl')
          ? photoUrlRaw === ''
            ? undefined
            : photoUrlRaw || undefined
          : undefined;

        if (fields.has('lastName') && !lastName) {
          errors.push(
            this.buildImportError(
              r + 1,
              'Пустой lastName',
              'lastName',
              'REQUIRED',
            ),
          );
          continue;
        }
        if (fields.has('firstName') && !firstName) {
          errors.push(
            this.buildImportError(
              r + 1,
              'Пустой firstName',
              'firstName',
              'REQUIRED',
            ),
          );
          continue;
        }

        if (fields.has('gender') && genderRaw && !gender) {
          errors.push(
            this.buildImportError(
              r + 1,
              'Недопустимое значение пола',
              'gender',
              'INVALID_ENUM',
              genderRaw,
            ),
          );
          continue;
        }

        let teamIdResolved: string | undefined;
        if (fields.has('team')) {
          try {
            teamIdResolved = await this.resolveTeamIdForCsv(
              tenantId,
              this.cellAt(row, headerMap, 'teamId'),
              this.cellAt(row, headerMap, 'teamName'),
            );
          } catch {
            errors.push(
              this.buildImportError(
                r + 1,
                'Не удалось сопоставить команду',
                'teamId',
                'TEAM_RESOLVE_FAILED',
              ),
            );
            continue;
          }
        }

        const teamIdForCreate = teamIdResolved?.trim() || undefined;
        const teamIdForUpdate = fields.has('team')
          ? teamIdResolved?.trim()
            ? teamIdResolved.trim()
            : null
          : undefined;

        const existing = id
          ? await this.prisma.player.findFirst({
              where: { id, tenantId },
              select: { id: true },
            })
          : null;

        const willCreate = !id || !existing;

        if (willCreate) {
          if (mode === 'updateOnly') {
            skipped++;
            continue;
          }
          const createLastName = lastName as string;
          const createFirstName = firstName as string;
          await this.create(tenantId, actorUserId, actorRole, {
            lastName: createLastName,
            firstName: createFirstName,
            ...(fields.has('birthDate') ? { birthDate } : {}),
            ...(fields.has('gender') ? { gender } : {}),
            ...(fields.has('position') ? { position } : {}),
            ...(fields.has('phone') ? { phone } : {}),
            ...(fields.has('bioNumber') ? { bioNumber } : {}),
            ...(fields.has('biography') ? { biography } : {}),
            ...(fields.has('photoUrl') ? { photoUrl } : {}),
            ...(fields.has('team') ? { teamId: teamIdForCreate } : {}),
          });
          created++;
          continue;
        }

        await this.update(tenantId, id, actorUserId, actorRole, {
          ...(fields.has('lastName') ? { lastName } : {}),
          ...(fields.has('firstName') ? { firstName } : {}),
          ...(fields.has('birthDate') ? { birthDate } : {}),
          ...(fields.has('gender') ? { gender } : {}),
          ...(fields.has('position') ? { position } : {}),
          ...(fields.has('phone') ? { phone } : {}),
          ...(fields.has('bioNumber') ? { bioNumber } : {}),
          ...(fields.has('biography') ? { biography } : {}),
          ...(fields.has('photoUrl') ? { photoUrl } : {}),
          ...(fields.has('team') ? { teamId: teamIdForUpdate } : {}),
        });
        updated++;
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        errors.push(this.buildImportError(r + 1, msg));
      }
    }

    return { created, updated, skipped, errors };
  }

  async importCsv(
    tenantId: string,
    actorUserId: string,
    actorRole: string,
    csvText: string,
    modeRaw?: string,
    fieldsRaw?: string,
  ): Promise<{
    created: number;
    updated: number;
    skipped: number;
    errors: Array<{
      row: number;
      message: string;
      field?: string;
      code?: string;
      value?: string;
    }>;
  }> {
    const rows = parseCsv(csvText.trim());
    return this.importRows(
      tenantId,
      actorUserId,
      actorRole,
      rows,
      modeRaw,
      fieldsRaw,
    );
  }

  async importXlsx(
    tenantId: string,
    actorUserId: string,
    actorRole: string,
    fileBuffer: Buffer,
    modeRaw?: string,
    fieldsRaw?: string,
  ): Promise<{
    created: number;
    updated: number;
    skipped: number;
    errors: Array<{
      row: number;
      message: string;
      field?: string;
      code?: string;
      value?: string;
    }>;
  }> {
    const wb = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) {
      throw new BadRequestException('XLSX: не найден лист с данными');
    }
    const ws = wb.Sheets[firstSheetName];
    const rowsRaw = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: true,
    }) as unknown[][];
    const rows = this.toStringMatrix(rowsRaw);
    return this.importRows(
      tenantId,
      actorUserId,
      actorRole,
      rows,
      modeRaw,
      fieldsRaw,
    );
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
