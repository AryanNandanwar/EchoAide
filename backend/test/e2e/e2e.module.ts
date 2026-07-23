import { Module } from '@nestjs/common';
import { ClinicalNotesModule } from '../../src/modules/clinical_notes/clinical-notes.module';
import { E2eController } from './e2e.controller';

@Module({
  imports: [ClinicalNotesModule],
  controllers: [E2eController],
})
export class E2eModule {}
