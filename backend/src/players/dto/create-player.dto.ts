import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlayerGender } from '@prisma/client';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { IsEnum } from 'class-validator';

export class CreatePlayerDto {
  @ApiProperty({ example: 'Иванов' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'Иван' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

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
  gender?: PlayerGender;

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
    description: 'Player photo URL (base64)',
    example: 'data:image/png;base64,...',
  })
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiPropertyOptional({
    description: 'Команда тенанта (у игрока может быть только одна команда)',
  })
  @IsOptional()
  @IsString()
  teamId?: string;
}
