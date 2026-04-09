import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateTeamPlayerDto {
  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  jerseyNumber?: number;

  @ApiPropertyOptional({ example: 'Вратарь' })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional({
    description:
      'В заявке на турниры учитываются только активные связи. Отключить нельзя, если у игрока есть события в протоколах активного турнира.',
    example: true,
  })
  @IsOptional()
  @Transform(
    ({ value }) =>
      value === true || value === 'true' || value === 1 || value === '1',
  )
  @IsBoolean()
  isActive?: boolean;
}
