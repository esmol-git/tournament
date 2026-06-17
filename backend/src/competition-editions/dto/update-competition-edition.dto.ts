import { PartialType } from '@nestjs/swagger';
import { CreateCompetitionEditionDto } from './create-competition-edition.dto';

export class UpdateCompetitionEditionDto extends PartialType(
  CreateCompetitionEditionDto,
) {}
