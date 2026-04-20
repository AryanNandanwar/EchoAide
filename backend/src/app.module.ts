// src/app.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { DoctorModule } from './modules/doctor/doctor.module';
import { DatabaseModule } from './db/database.module';
// OPTIONAL: ConfigModule is recommended
import { ConfigModule } from '@nestjs/config';
import { ClinicalNotesModule } from './modules/clinical_notes/clinical-notes.module';
import { PatientModule } from './modules/patient/patient.module';
import { WebSocketModule } from './modules/websocket/websocket.module';
import { SseModule } from './modules/sse/sse.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // optional but strongly recommended
    DatabaseModule,  // ensures DB providers load early
    AuthModule,      // <<< REQUIRED (contains /auth/signup and /auth/login)
    DoctorModule,    // needed if doctor-related routes / services exist
    ClinicalNotesModule, // <<< Clinical Notes Module
    PatientModule,      // <<< Patient Module
    WebSocketModule,    // <<< WebSocket Module for streaming
    SseModule,          // <<< SSE Module for final note notifications
  ],
})
export class AppModule {}
