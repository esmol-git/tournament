import { ApiProperty } from '@nestjs/swagger';
import { MatchRefereeRole } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class MatchRefereeAssignmentDto {
  @ApiProperty()
  @IsString()
  refereeId!: string;

  @ApiProperty({ enum: MatchRefereeRole })
  @IsEnum(MatchRefereeRole)
  role!: MatchRefereeRole;
}
