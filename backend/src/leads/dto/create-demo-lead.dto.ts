import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDemoLeadDto {
  @ApiProperty({ example: 'Иван' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: '@ivan_manager' })
  @IsString()
  @MinLength(5)
  @MaxLength(160)
  contact: string;

  @ApiProperty({ example: 'Супер Лига СПб' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  league: string;

  @ApiProperty({ example: 'Нужен запуск публичного сайта и админки' })
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  message: string;

  @ApiProperty({ example: 'landing', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  source?: string;
}
