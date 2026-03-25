import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsString, Min, ValidateNested } from 'class-validator';

export class SyncTeamsGroupLayoutItemDto {
  @ApiProperty()
  @IsString()
  teamId!: string;

  @ApiProperty()
  @IsString()
  groupId!: string;

  @ApiProperty({ description: '0-based order within the group column' })
  @IsInt()
  @Min(0)
  groupSortOrder!: number;
}

export class SyncTeamsGroupLayoutDto {
  @ApiProperty({ type: [SyncTeamsGroupLayoutItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncTeamsGroupLayoutItemDto)
  items!: SyncTeamsGroupLayoutItemDto[];
}
