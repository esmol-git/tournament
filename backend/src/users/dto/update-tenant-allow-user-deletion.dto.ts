import { IsBoolean } from 'class-validator';

export class UpdateTenantAllowUserDeletionDto {
  @IsBoolean()
  allowUserDeletion!: boolean;
}
