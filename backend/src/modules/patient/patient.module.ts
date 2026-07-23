// src/modules/patient/patient.module.ts
import { Module } from '@nestjs/common';
import { PatientService } from './patient.service';
import { PatientController } from './patient.controller';
import { DatabaseModule } from '../../db/database.module';
import { patientProviders } from './patient.provider';
import { doctorProviders } from '../doctor/doctor.providers';

@Module({
  imports: [DatabaseModule],
  providers: [...patientProviders,...doctorProviders ,PatientService],
  controllers: [PatientController],
  exports: [PatientService],
})
export class PatientModule {}
