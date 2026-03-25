import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SetTeamGroupDto {
  @ApiPropertyOptional({
    description: 'TournamentGroup.id to assign; omit or null to clear',
    example: 'clx...',
  })
  @IsOptional()
  @IsString()
  groupId?: string | null;
}
