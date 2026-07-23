import request from 'supertest';
import {
  authHeader,
  closeApiTestApp,
  createApiTestApp,
  resetApiDatabase,
  seedDoctorWithToken,
  seedReceptionistWithToken,
  type ApiTestContext,
} from '../utils/api-test.helper';

describe('Intake API', () => {
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

  it('POST /api/intake/patients requires authentication', async () => {
    await request(context.httpServer)
      .post('/api/intake/patients')
      .send({
        fullName: 'Queue Patient',
        gender: 'female',
        age: '32',
        phone: '+919876543210',
      })
      .expect(401);
  });

  it('allows receptionists to create intake patients', async () => {
    const { doctor } = await seedDoctorWithToken(context);
    const { tokens } = await seedReceptionistWithToken(context, doctor.id);

    const response = await request(context.httpServer)
      .post('/api/intake/patients')
      .set(authHeader(tokens.accessToken))
      .send({
        fullName: 'Queue Patient',
        gender: 'female',
        age: '32',
        weight: '60 kg',
        phone: '+919876543210',
      })
      .expect(201);

    expect(response.body.status).toBe('pending');
    expect(response.body.patient.fullName).toBe('Queue Patient');
  });

  it('forbids doctors from creating intake patients', async () => {
    const { tokens } = await seedDoctorWithToken(context);

    await request(context.httpServer)
      .post('/api/intake/patients')
      .set(authHeader(tokens.accessToken))
      .send({
        fullName: 'Doctor Attempt',
        gender: 'male',
        age: '40',
        phone: '+919111111111',
      })
      .expect(403);
  });

  it('allows doctors to read the intake queue', async () => {
    const { doctor, tokens: doctorTokens } = await seedDoctorWithToken(context);
    const { tokens: receptionistTokens } = await seedReceptionistWithToken(context, doctor.id);

    await request(context.httpServer)
      .post('/api/intake/patients')
      .set(authHeader(receptionistTokens.accessToken))
      .send({
        fullName: 'Queued Patient',
        gender: 'female',
        age: '29',
        phone: '+919222222222',
      })
      .expect(201);

    const queue = await request(context.httpServer)
      .get('/api/intake/queue')
      .set(authHeader(doctorTokens.accessToken))
      .expect(200);

    expect(queue.body).toHaveLength(1);
    expect(queue.body[0].patient.fullName).toBe('Queued Patient');
  });

  it('forbids receptionists from reading the doctor queue', async () => {
    const { doctor } = await seedDoctorWithToken(context);
    const { tokens } = await seedReceptionistWithToken(context, doctor.id);

    await request(context.httpServer)
      .get('/api/intake/queue')
      .set(authHeader(tokens.accessToken))
      .expect(403);
  });

  it('allows doctors to update intake status', async () => {
    const { doctor, tokens: doctorTokens } = await seedDoctorWithToken(context);
    const { tokens: receptionistTokens } = await seedReceptionistWithToken(context, doctor.id);

    const created = await request(context.httpServer)
      .post('/api/intake/patients')
      .set(authHeader(receptionistTokens.accessToken))
      .send({
        fullName: 'Status Patient',
        gender: 'male',
        age: '45',
        phone: '+919333333333',
      })
      .expect(201);

    const updated = await request(context.httpServer)
      .patch(`/api/intake/${created.body.id}/status`)
      .set(authHeader(doctorTokens.accessToken))
      .send({ status: 'in_progress' })
      .expect(200);

    expect(updated.body.status).toBe('in_progress');
  });

  it('forbids doctors from updating another doctor intake', async () => {
    const { doctor, tokens: doctorTokens } = await seedDoctorWithToken(context);
    const { tokens: otherDoctorTokens } = await seedDoctorWithToken(context, {
      email: 'other-intake-doctor@test.local',
    });
    const { tokens: receptionistTokens } = await seedReceptionistWithToken(context, doctor.id);

    const created = await request(context.httpServer)
      .post('/api/intake/patients')
      .set(authHeader(receptionistTokens.accessToken))
      .send({
        fullName: 'Foreign Intake',
        gender: 'male',
        age: '20',
        phone: '+919444444444',
      })
      .expect(201);

    await request(context.httpServer)
      .patch(`/api/intake/${created.body.id}/status`)
      .set(authHeader(otherDoctorTokens.accessToken))
      .send({ status: 'completed' })
      .expect(404);
  });
});
