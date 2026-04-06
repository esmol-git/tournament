import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Редактирование своей учётной записи (без смены роли).
 * Email: если в БД уже задан — менять нельзя; если пусто — можно указать один раз.
 */
export class UpdateMyProfileDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    const s = String(value).trim();
    return s === '' ? undefined : s.toLowerCase();
  })
  @IsString()
  @MaxLength(320)
  email?: string;

  /** Только TENANT_ADMIN / SUPER_ADMIN (сам себе в профиле); остальные — через админа в «Пользователи». */
  @IsOptional()
  @IsString()
  @MinLength(3)
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  name?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  /** Только TENANT_ADMIN / SUPER_ADMIN в профиле; остальные — пароль задаёт админ в «Пользователи». */
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  /** Обязателен при смене пароля (`password`). */
  @IsOptional()
  @IsString()
  currentPassword?: string;
}
