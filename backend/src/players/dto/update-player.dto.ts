import { ApiPropertyOptional } from '@nestjs/swagger';
import { PlayerGender } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';

export class UpdatePlayerDto {
  @ApiPropertyOptional({ example: 'Иванов' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: 'Иван' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Birth date as YYYY-MM-DD',
    example: '2007-01-01',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'birthDate must be YYYY-MM-DD' })
  birthDate?: string;

  @ApiPropertyOptional({ example: 'Вратарь' })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional({ enum: PlayerGender, example: PlayerGender.MALE })
  @IsOptional()
  @IsEnum(PlayerGender)
  gender?: PlayerGender | null;

  @ApiPropertyOptional({ example: '+79990001122' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Biography number', example: '12345' })
  @IsOptional()
  @IsString()
  bioNumber?: string;

  @ApiPropertyOptional({
    description: 'Biography text (markdown in future)',
    example: '### О игроке\\n...',
  })
  @IsOptional()
  @IsString()
  biography?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'URL фото; null — убрать фото',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  photoUrl?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Команда; null — убрать из команды; не передавать — не менять',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @IsNotEmpty()
  teamId?: string | null;
}
