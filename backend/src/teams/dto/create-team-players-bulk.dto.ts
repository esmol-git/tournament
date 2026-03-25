import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class CreateTeamPlayersBulkDto {
  @ApiProperty({
    type: [String],
    description: 'Player ids to add into team',
    example: ['clx1...', 'clx2...'],
  })
  @IsArray()
  @IsString({ each: true })
  playerIds: string[];
}
