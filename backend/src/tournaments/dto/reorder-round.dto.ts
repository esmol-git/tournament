import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderRoundDto {
  @ApiProperty({ example: ['matchId1', 'matchId2'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  matchIds: string[];
}
