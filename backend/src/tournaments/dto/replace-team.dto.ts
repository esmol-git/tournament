import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ReplaceTeamDto {
  @ApiProperty({ description: 'ID команды-замены из справочника' })
  @IsString()
  newTeamId: string;
}
