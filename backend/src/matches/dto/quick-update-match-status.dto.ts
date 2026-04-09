import { ApiProperty } from '@nestjs/swagger';
import { MatchStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class QuickUpdateMatchStatusDto {
  @ApiProperty({
    enum: [MatchStatus.SCHEDULED, MatchStatus.LIVE, MatchStatus.FINISHED],
    example: MatchStatus.LIVE,
  })
  @IsEnum([MatchStatus.SCHEDULED, MatchStatus.LIVE, MatchStatus.FINISHED])
  status!: MatchStatus;
}
