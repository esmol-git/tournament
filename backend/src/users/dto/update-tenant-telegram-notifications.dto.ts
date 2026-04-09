import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTenantTelegramNotificationsDto {
  @ApiPropertyOptional({
    nullable: true,
    description: 'chat_id или @channel_username',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  telegramNotifyChatId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  telegramNotifyOnMatchRescheduled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  telegramNotifyOnProtocolPublished?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  telegramNotifyOnMatchStartingSoon?: boolean;
}
