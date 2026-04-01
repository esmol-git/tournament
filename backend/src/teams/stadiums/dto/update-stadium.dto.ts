import { IsOptional, IsString, ValidateIf } from 'class-validator';

export class UpdateStadiumDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  regionId?: string | null;

  @IsOptional()
  @IsString()
  note?: string;
}
