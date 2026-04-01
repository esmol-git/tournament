import { IsOptional, IsString, MinLength } from 'class-validator';

/** Редактирование своей учётной записи (без смены роли и email). */
export class UpdateMyProfileDto {
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

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  /** Обязателен при смене пароля (`password`). */
  @IsOptional()
  @IsString()
  currentPassword?: string;
}
