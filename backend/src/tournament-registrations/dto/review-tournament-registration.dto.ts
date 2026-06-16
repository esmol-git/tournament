import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TournamentRegistrationStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const REVIEW_STATUSES = [
  TournamentRegistrationStatus.APPROVED,
  TournamentRegistrationStatus.REJECTED,
  TournamentRegistrationStatus.WAITLIST,
] as const;

export class ReviewTournamentRegistrationDto {
  @ApiProperty({
    enum: REVIEW_STATUSES,
  })
  @IsIn(REVIEW_STATUSES)
  status!: (typeof REVIEW_STATUSES)[number];

  @ApiPropertyOptional({ description: 'Комментарий организатора (причина отказа и т.д.)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string;
}
