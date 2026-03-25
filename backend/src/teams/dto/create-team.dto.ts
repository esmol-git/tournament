import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTeamDto {
  @ApiProperty({ example: 'Спартак U12' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'spartak-u12' })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiPropertyOptional({ example: 'U12' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'https://...' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ example: 'Иван Иванов' })
  @IsOptional()
  @IsString()
  coachName?: string;

  @ApiPropertyOptional({ example: '+7 (999) 123-45-67' })
  @IsOptional()
  @IsString()
  coachPhone?: string;

  @ApiPropertyOptional({ example: 'ivan@example.com' })
  @IsOptional()
  @IsString()
  coachEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

}
