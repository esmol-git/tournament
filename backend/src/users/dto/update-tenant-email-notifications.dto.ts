import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTenantEmailNotificationsDto {
  @ApiPropertyOptional({
    nullable: true,
    description: 'Список email через запятую',
    example: 'ops@example.com,manager@example.com',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  emailNotifyRecipients?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emailNotifyEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emailNotifyOnMatchRescheduled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emailNotifyOnProtocolPublished?: boolean;

  @ApiPropertyOptional({
    description:
      'Добавлять email тренеров команд-участниц матча (coachEmail) в рассылку',
  })
  @IsOptional()
  @IsBoolean()
  emailNotifyMatchTeamCoachRole?: boolean;

  @ApiPropertyOptional({
    description: 'Добавлять email TEAM_ADMIN команд-участниц матча в рассылку',
  })
  @IsOptional()
  @IsBoolean()
  emailNotifyMatchTeamAdminRole?: boolean;
}
