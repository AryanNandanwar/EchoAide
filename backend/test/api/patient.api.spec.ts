import request from 'supertest';
import {
  authHeader,
  closeApiTestApp,
  createApiTestApp,
  createTestPatient,
  resetApiDatabase,
  seedDoctorWithToken,
  seedReceptionistWithToken,
  type ApiTestContext,
} from '../utils/api-test.helper';

describe('Patient API', () => {
  let context: ApiTestContext;

  beforeAll(async () => {
    context = await createApiTestApp();
  });

  afterAll(async () => {
    await closeApiTestApp(context);
  });

  beforeEach(async () => {
    await resetApiDatabase(context);
  });

  it('GET /api/doctor/me/patients requires authentication', async () => {
    await request(context.httpServer).get('/api/doctor/me/patients').expect(401);
  });

  it('rejects receptionist access to patient routes', async () => {
    const { doctor } = await seedDoctorWithToken(context);
    const { tokens } = await seedReceptionistWithToken(context, doctor.id);

    await request(context.httpServer)
      .get('/api/doctor/me/patients')
      .set(authHeader(tokens.accessToken))
      .expect(403);
  });

  it('creates, reads, updates, and deletes patients for the logged-in doctor', async () => {
    const { tokens } = await seedDoctorWithToken(context);

    const created = await request(context.httpServer)
      .post('/api/doctor/me/patients')
      .set(authHeader(tokens.accessToken))
      .send({
        fullName: 'Asha Rao',
        gender: 'female',
        age: '41',
        phone: '+919876543210',
      })
      .expect(201);

    const patientId = created.body.id;

    const fetched = await request(context.httpServer)
      .get(`/api/doctor/me/patients/${patientId}`)
      .set(authHeader(tokens.accessToken))
      .expect(200);
    expect(fetched.body.fullName).toBe('Asha Rao');

    await request(context.httpServer)
      .put(`/api/doctor/me/patients/${patientId}`)
      .set(authHeader(tokens.accessToken))
      .send({ fullName: 'Asha Rao Updated', weight: '68 kg' })
      .expect(200);

    await request(context.httpServer)
      .delete(`/api/doctor/me/patients/${patientId}`)
      .set(authHeader(tokens.accessToken))
      .expect(200);

    await request(context.httpServer)
      .get(`/api/doctor/me/patients/${patientId}`)
      .set(authHeader(tokens.accessToken))
      .expect(404);
  });

  it('prevents a doctor from reading another doctor patient', async () => {
    const { doctor, tokens } = await seedDoctorWithToken(context);
    const { tokens: otherDoctorTokens } = await seedDoctorWithToken(context, {
      email: 'other-doctor-patient@test.local',
    });

    const patient = await createTestPatient(context.dataSource, doctor.id, {
      fullName: 'Private Patient',
      phone: '+919999999999',
    });

    await request(context.httpServer)
      .get(`/api/doctor/me/patients/${patient.id}`)
      .set(authHeader(otherDoctorTokens.accessToken))
      .expect(404);
  });

  it('searches patients for the authenticated doctor', async () => {
    const { doctor, tokens } = await seedDoctorWithToken(context);
    await createTestPatient(context.dataSource, doctor.id, {
      fullName: 'Searchable Patient',
      phone: '+919111111111',
    });

    const response = await request(context.httpServer)
      .get('/api/doctor/me/patients')
      .query({ q: 'Searchable' })
      .set(authHeader(tokens.accessToken))
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].fullName).toBe('Searchable Patient');
  });

  it('POST /api/doctor/me/patients/matches/preview returns match results', async () => {
    const { doctor, tokens } = await seedDoctorWithToken(context);
    await createTestPatient(context.dataSource, doctor.id, {
      fullName: 'Match Patient',
      phone: '+919876543210',
    });

    const response = await request(context.httpServer)
      .post('/api/doctor/me/patients/matches/preview')
      .set(authHeader(tokens.accessToken))
      .send({
        fullName: 'Different Name',
        phone: '+919876543210',
      })
      .expect(200);

    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body[0].matchedOn).toContain('phone');
  });
});
