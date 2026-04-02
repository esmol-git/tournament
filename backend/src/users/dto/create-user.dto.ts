import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  username: string;

  /** Необязателен (в отличие от регистрации организации). Пустая строка → null. */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === undefined) return undefined;
    const s = String(value).trim();
    return s === '' ? undefined : s;
  })
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(3)
  name: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
