import request from 'supertest';
import {
  authHeader,
  closeApiTestApp,
  createApiTestApp,
  loginDoctor,
  resetApiDatabase,
  seedDoctorWithToken,
  seedReceptionistWithToken,
  type ApiTestContext,
} from '../utils/api-test.helper';
import { createTestDoctor } from '../utils/integration-test.helper';

describe('Auth API', () => {
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

  it('POST /api/auth/signup creates a doctor account', async () => {
    const response = await request(context.httpServer)
      .post('/api/auth/signup')
      .send({
        fullName: 'Dr Signup',
        email: 'signup@test.local',
        password: 'password123',
        specialization: 'Cardiology',
      })
      .expect(201);

    expect(response.body.email).toBe('signup@test.local');
    expect(response.body.passwordHash).toBeUndefined();
  });

  it('POST /api/auth/signup rejects invalid payloads', async () => {
    await request(context.httpServer)
      .post('/api/auth/signup')
      .send({
        fullName: 'Dr Invalid',
        email: 'not-an-email',
        password: 'short',
        specialization: 'Cardiology',
      })
      .expect(400);
  });

  it('POST /api/auth/login authenticates a doctor', async () => {
    const { doctor } = await seedDoctorWithToken(context, {
      email: 'doctor-login@test.local',
    });

    const response = await request(context.httpServer)
      .post('/api/auth/login')
      .send({
        email: doctor.email,
        password: 'password123',
        accountType: 'doctor',
      })
      .expect(201);

    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.refreshToken).toBeTruthy();
    expect(response.body.user.role).toBe('doctor');
  });

  it('POST /api/auth/login authenticates a receptionist', async () => {
    const { doctor } = await seedDoctorWithToken(context);
    const { receptionist } = await seedReceptionistWithToken(context, doctor.id, {
      email: 'receptionist-login@test.local',
    });

    const response = await request(context.httpServer)
      .post('/api/auth/login')
      .send({
        email: receptionist.email,
        password: 'password123',
        accountType: 'receptionist',
      })
      .expect(201);

    expect(response.body.user.role).toBe('receptionist');
    expect(response.body.user.doctorId).toBe(doctor.id);
  });

  it('POST /api/auth/login rejects invalid credentials', async () => {
    await seedDoctorWithToken(context, { email: 'wrongpass@test.local' });

    await request(context.httpServer)
      .post('/api/auth/login')
      .send({
        email: 'wrongpass@test.local',
        password: 'incorrect-password',
        accountType: 'doctor',
      })
      .expect(401);
  });

  it('POST /api/auth/refresh rotates tokens', async () => {
    const { doctor } = await seedDoctorWithToken(context, { email: 'refresh@test.local' });
    const login = await loginDoctor(context.httpServer, doctor.email);

    const refreshed = await request(context.httpServer)
      .post('/api/auth/refresh')
      .send({ refreshToken: login.refreshToken })
      .expect(201);

    expect(refreshed.body.accessToken).toBeTruthy();
    expect(refreshed.body.refreshToken).not.toBe(login.refreshToken);

    await request(context.httpServer)
      .post('/api/auth/refresh')
      .send({ refreshToken: login.refreshToken })
      .expect(401);
  });

  it('POST /api/auth/logout invalidates refresh tokens', async () => {
    const { doctor } = await seedDoctorWithToken(context, { email: 'logout@test.local' });
    const login = await loginDoctor(context.httpServer, doctor.email);

    await request(context.httpServer)
      .post('/api/auth/logout')
      .send({ refreshToken: login.refreshToken })
      .expect(201);

    await request(context.httpServer)
      .post('/api/auth/refresh')
      .send({ refreshToken: login.refreshToken })
      .expect(401);
  });

  it('POST /api/auth/receptionists requires a doctor token', async () => {
    const { doctor, tokens } = await seedDoctorWithToken(context);

    const response = await request(context.httpServer)
      .post('/api/auth/receptionists')
      .set(authHeader(tokens.accessToken))
      .send({
        fullName: 'Front Desk',
        email: 'frontdesk@test.local',
        password: 'password123',
        doctorId: doctor.id,
      })
      .expect(201);

    expect(response.body.doctorId).toBe(doctor.id);
  });

  it('POST /api/auth/receptionists rejects receptionist tokens', async () => {
    const { doctor } = await seedDoctorWithToken(context);
    const { tokens } = await seedReceptionistWithToken(context, doctor.id);

    await request(context.httpServer)
      .post('/api/auth/receptionists')
      .set(authHeader(tokens.accessToken))
      .send({
        fullName: 'Blocked Desk',
        email: 'blocked@test.local',
        password: 'password123',
        doctorId: doctor.id,
      })
      .expect(403);
  });
});
