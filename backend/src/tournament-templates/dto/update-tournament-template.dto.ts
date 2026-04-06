import { PartialType } from '@nestjs/swagger';
import { CreateTournamentTemplateDto } from './create-tournament-template.dto';

export class UpdateTournamentTemplateDto extends PartialType(
  CreateTournamentTemplateDto,
) {}
