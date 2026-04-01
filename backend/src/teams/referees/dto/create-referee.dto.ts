import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRefereeDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  note?: string;

  /** Id категории из справочника тенанта; пусто — без категории */
  @IsOptional()
  @IsString()
  refereeCategoryId?: string;

  /** Id позиции (главный, линейный и т.д.); пусто — без позиции */
  @IsOptional()
  @IsString()
  refereePositionId?: string;
}
