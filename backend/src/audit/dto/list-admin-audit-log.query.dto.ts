import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Быстрый пресет фильтра (дополняет остальные поля запроса). */
export const ADMIN_AUDIT_QUICK_FILTER_VALUES = [
  'all',
  'success',
  'forbidden',
  'error',
  'delete',
] as const;

export type AdminAuditQuickFilter =
  (typeof ADMIN_AUDIT_QUICK_FILTER_VALUES)[number];

/**
 * DTO запроса списка аудит-логов.
 * В документации может фигурировать как `ListAuditLogsQueryDto`.
 */
export class ListAdminAuditLogQueryDto {
  @ApiPropertyOptional({ description: 'Фильтр по userId (cuid)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;

  @ApiPropertyOptional({ description: 'Фильтр по роли (строка enum UserRole)' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(599)
  httpStatus?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  errorCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  resourceType?: string;

  /** Начало периода (ISO 8601 или YYYY-MM-DD). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  dateFrom?: string;

  /** Конец периода включительно (ISO 8601 или YYYY-MM-DD). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  dateTo?: string;

  /**
   * Быстрый фильтр: успешные операции (`result=success`), отказы (403/401/`denied`),
   * ошибки сервера (5xx / `error`), только DELETE, либо без пресета.
   */
  @ApiPropertyOptional({
    enum: ADMIN_AUDIT_QUICK_FILTER_VALUES,
    description: 'quickFilter preset',
  })
  @IsOptional()
  @IsIn(ADMIN_AUDIT_QUICK_FILTER_VALUES)
  quickFilter?: AdminAuditQuickFilter;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  /** Язык человекочитаемых подписей (`humanAction`, подписи без перевода на фронте). */
  @ApiPropertyOptional({ enum: ['ru', 'en'] })
  @IsOptional()
  @IsIn(['ru', 'en'])
  locale?: 'ru' | 'en';
}
