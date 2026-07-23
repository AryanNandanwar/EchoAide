import request from 'supertest';
import { ClinicalNotesService } from '../../src/modules/clinical_notes/clinical-notes.service';
import {
  authHeader,
  closeApiTestApp,
  createApiTestApp,
  resetApiDatabase,
  seedDoctorWithToken,
  seedReceptionistWithToken,
  type ApiTestContext,
} from '../utils/api-test.helper';

describe('Clinical Notes API', () => {
  let context: ApiTestContext;
  let clinicalNotesService: ClinicalNotesService;

  beforeAll(async () => {
    context = await createApiTestApp({ mockPdf: true, mockStreaming: true });
    clinicalNotesService = context.module.get(ClinicalNotesService);
  });

  afterAll(async () => {
    await closeApiTestApp(context);
  });

  beforeEach(async () => {
    await resetApiDatabase(context);
  });

  async function createNoteForDoctor(doctorId: string, noteId: string) {
    await clinicalNotesService.createWithId(
      {
        patientDetails: { name: 'Asha Rao' },
        medicalHistory: ['Diabetes'],
        problemFaced: ['Headache'],
        findings: ['BP elevated'],
        diagnosis: ['Hypertension'],
        investigationsAdvised: ['CBC'],
        doctorInstructions: ['Follow up'],
        medicationPrescribed: ['Amlodipine 5mg'],
        status: 'Draft',
      },
      doctorId,
      noteId,
    );
  }

  it('GET /api/clinical-notes requires authentication', async () => {
    await request(context.httpServer).get('/api/clinical-notes').expect(401);
  });

  it('GET /api/clinical-notes rejects receptionist tokens', async () => {
    const { doctor } = await seedDoctorWithToken(context);
    const { tokens } = await seedReceptionistWithToken(context, doctor.id);

    await request(context.httpServer)
      .get('/api/clinical-notes')
      .set(authHeader(tokens.accessToken))
      .expect(403);
  });

  it('supports clinical note CRUD for doctors', async () => {
    const { doctor, tokens } = await seedDoctorWithToken(context);

    const created = await request(context.httpServer)
      .post('/api/clinical-notes')
      .set(authHeader(tokens.accessToken))
      .send({
        patientDetails: { name: 'Asha Rao' },
        medicalHistory: ['Diabetes'],
        problemFaced: ['Headache'],
        findings: ['BP elevated'],
        diagnosis: ['Hypertension'],
        investigationsAdvised: ['CBC'],
        doctorInstructions: ['Follow up'],
        medicationPrescribed: ['Amlodipine 5mg'],
        status: 'Draft',
      })
      .expect(201);

    const noteId = created.body.id;
    expect(noteId).toBeTruthy();

    const listed = await request(context.httpServer)
      .get('/api/clinical-notes')
      .set(authHeader(tokens.accessToken))
      .expect(200);
    expect(listed.body).toHaveLength(1);

    const fetched = await request(context.httpServer)
      .get(`/api/clinical-notes/${noteId}`)
      .set(authHeader(tokens.accessToken))
      .expect(200);
    expect(fetched.body.id).toBe(noteId);

    await request(context.httpServer)
      .patch(`/api/clinical-notes/${noteId}`)
      .set(authHeader(tokens.accessToken))
      .send({ status: 'Confirmed', problemFaced: ['Updated headache'] })
      .expect(200);

    await request(context.httpServer)
      .delete(`/api/clinical-notes/${noteId}`)
      .set(authHeader(tokens.accessToken))
      .expect(200);

    await request(context.httpServer)
      .get(`/api/clinical-notes/${noteId}`)
      .set(authHeader(tokens.accessToken))
      .expect(404);
  });

  it('scopes note access to the authenticated doctor', async () => {
    const { doctor, tokens } = await seedDoctorWithToken(context);
    const { tokens: otherDoctorTokens } = await seedDoctorWithToken(context, {
      email: 'other-doctor@test.local',
    });

    await createNoteForDoctor(doctor.id, 'scoped-note');

    await request(context.httpServer)
      .get('/api/clinical-notes/scoped-note')
      .set(authHeader(otherDoctorTokens.accessToken))
      .expect(404);
  });

  it('GET /api/clinical-notes/:id/pdf returns PDF headers', async () => {
    const { doctor, tokens } = await seedDoctorWithToken(context);
    await createNoteForDoctor(doctor.id, 'pdf-note');

    const response = await request(context.httpServer)
      .get('/api/clinical-notes/pdf-note/pdf')
      .set(authHeader(tokens.accessToken))
      .expect(200);

    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('clinical-note-pdf-note.pdf');
    expect(Buffer.isBuffer(response.body) || typeof response.body === 'object').toBe(true);
  });
});
