import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DataSource } from 'typeorm';
import { clearIntegrationData } from '../utils/integration-test.helper';
import { seedE2eUsers } from './seed';
import { ClinicalNotesService } from '../../src/modules/clinical_notes/clinical-notes.service';
import { defaultMockFinalNote } from '../utils/websocket-test.helper';

@Controller('e2e')
export class E2eController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly clinicalNotesService: ClinicalNotesService,
  ) {}

  @Get('health')
  health() {
    return { ok: true };
  }

  @Post('reset')
  async reset() {
    if (process.env.E2E_MODE !== 'true') {
      return { ok: false, message: 'E2E mode disabled' };
    }

    await clearIntegrationData(this.dataSource);
    await seedE2eUsers(this.dataSource);

    return { ok: true };
  }

  @Post('simulate-recording')
  @UseGuards(AuthGuard('jwt'))
  async simulateRecording(
    @Req() req: { user: { id: string; role?: string } },
    @Body() body: { patientDetails?: Record<string, string> } = {},
  ) {
    if (process.env.E2E_MODE !== 'true') {
      return { ok: false, message: 'E2E mode disabled' };
    }

    if (req.user.role !== 'doctor') {
      return { ok: false, message: 'Doctor role required' };
    }

    const patientDetails = {
      name: defaultMockFinalNote.patientDetails?.name ?? 'WebSocket Patient',
      ...(body.patientDetails ?? {}),
    };

    const note = await this.clinicalNotesService.create(
      {
        patientDetails,
        medicalHistory: Array.isArray(defaultMockFinalNote.medicalHistory)
          ? [...defaultMockFinalNote.medicalHistory]
          : [],
        problemFaced: [
          typeof defaultMockFinalNote.problemFaced === 'string'
            ? defaultMockFinalNote.problemFaced
            : 'Test problem',
        ],
        findings: Array.isArray(defaultMockFinalNote.findings)
          ? [...defaultMockFinalNote.findings]
          : [],
        diagnosis: [...(defaultMockFinalNote.diagnosis ?? [])],
        investigationsAdvised: [...(defaultMockFinalNote.investigationsAdvised ?? [])],
        doctorInstructions: [...(defaultMockFinalNote.doctorInstructions ?? [])],
        medicationPrescribed: (defaultMockFinalNote.medicationPrescribed ?? []).map((item) =>
          typeof item === 'string' ? item : item.name ?? 'Medication',
        ),
        status: 'Draft',
      },
      req.user.id,
    );

    return { ok: true, noteId: note.id };
  }
}
