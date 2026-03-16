// src/clinical_notes/modules/clinical-notes/clinical-notes.module.ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../db/database.module';
import { clinicalNotesProviders } from './clinical-notes.providers';
import { ClinicalNotesService } from './clinical-notes.service';
import { ClinicalNotesController } from './clinical-note.controller';
import { PdfService } from './pdf.service';
import { patientProviders } from '../patient/patient.provider';
import { doctorProviders } from '../doctor/doctor.providers';

@Module({
  imports: [DatabaseModule],
  controllers: [ClinicalNotesController],
  providers: [ClinicalNotesService, PdfService, ...clinicalNotesProviders, ...patientProviders, ...doctorProviders],
  exports: [ClinicalNotesService],
})
export class ClinicalNotesModule {}
