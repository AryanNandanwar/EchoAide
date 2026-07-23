import { TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../../src/modules/auth/auth.service';
import {
  clearIntegrationData,
  createIntegrationTestingModule,
  createTestDoctor,
  getRepo,
} from '../utils/integration-test.helper';
import { Doctor } from '../../src/modules/doctor/doctor.entity';
import { RefreshToken } from '../../src/modules/auth/entities/refresh-token.entity';

describe('AuthService integration', () => {
  let module: TestingModule;
  let authService: AuthService;
  let dataSource: DataSource;

  beforeAll(async () => {
    module = await createIntegrationTestingModule([
      AuthService,
      ConfigService,
    ]);
    authService = module.get(AuthService);
    dataSource = module.get(DataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
    await module.close();
  });

  beforeEach(async () => {
    await clearIntegrationData(dataSource);
  });

  it('signs up a doctor with a bcrypt password hash', async () => {
    const doctor = await authService.signup({
      fullName: 'Dr Signup',
      email: 'signup@test.local',
      password: 'SecurePass123!',
      specialization: 'Cardiology',
    });

    expect(doctor.email).toBe('signup@test.local');
    expect(doctor.fullName).toBe('Dr Signup');

    const stored = await getRepo(dataSource, Doctor).findOneByOrFail({ email: doctor.email });
    expect(stored.passwordHash).toBeDefined();
    expect(await bcrypt.compare('SecurePass123!', stored.passwordHash)).toBe(true);
  });

  it('rejects duplicate email on signup', async () => {
    await authService.signup({
      fullName: 'Dr One',
      email: 'duplicate@test.local',
      password: 'password123',
    });

    await expect(
      authService.signup({
        fullName: 'Dr Two',
        email: 'duplicate@test.local',
        password: 'password456',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('logs in a doctor and returns access and refresh tokens', async () => {
    await authService.signup({
      fullName: 'Dr Login',
      email: 'login@test.local',
      password: 'password123',
    });

    const result = await authService.login('login@test.local', 'password123', 'doctor');

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.user.role).toBe('doctor');
    expect(result.user.email).toBe('login@test.local');
  });

  it('rejects login with wrong password', async () => {
    await authService.signup({
      fullName: 'Dr WrongPass',
      email: 'wrongpass@test.local',
      password: 'correct-password',
    });

    await expect(
      authService.login('wrongpass@test.local', 'wrong-password', 'doctor'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('signs up a receptionist scoped to a doctor', async () => {
    const doctor = await createTestDoctor(dataSource);

    const receptionist = await authService.signupReceptionist({
      fullName: 'Desk Staff',
      email: 'receptionist@test.local',
      password: 'password123',
      doctorId: doctor.id,
    });

    expect(receptionist.doctorId).toBe(doctor.id);
    expect(receptionist.email).toBe('receptionist@test.local');
  });

  it('logs in a receptionist with doctorId in the token payload', async () => {
    const doctor = await createTestDoctor(dataSource);
    await authService.signupReceptionist({
      fullName: 'Desk Staff',
      email: 'receptionist-login@test.local',
      password: 'password123',
      doctorId: doctor.id,
    });

    const result = await authService.login(
      'receptionist-login@test.local',
      'password123',
      'receptionist',
    );

    expect(result.user.role).toBe('receptionist');
    expect(result.user.doctorId).toBe(doctor.id);
  });

  it('rotates refresh tokens and revokes the previous token', async () => {
    await authService.signup({
      fullName: 'Dr Refresh',
      email: 'refresh@test.local',
      password: 'password123',
    });

    const login = await authService.login('refresh@test.local', 'password123', 'doctor');
    const refreshed = await authService.refresh(login.refreshToken);

    expect(refreshed.accessToken).toBeTruthy();
    expect(refreshed.refreshToken).not.toBe(login.refreshToken);

    await expect(authService.refresh(login.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('invalidates refresh token on logout', async () => {
    await authService.signup({
      fullName: 'Dr Logout',
      email: 'logout@test.local',
      password: 'password123',
    });

    const login = await authService.login('logout@test.local', 'password123', 'doctor');
    await authService.logout(login.refreshToken);

    await expect(authService.refresh(login.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    const tokens = await getRepo(dataSource, RefreshToken).find();
    expect(tokens.every((token) => token.revokedAt !== null)).toBe(true);
  });

  it('allows a doctor to create a receptionist for their practice', async () => {
    const doctor = await createTestDoctor(dataSource);

    const receptionist = await authService.createReceptionist(doctor.id, {
      fullName: 'Created Receptionist',
      email: 'created-receptionist@test.local',
      password: 'password123',
    });

    expect(receptionist.doctorId).toBe(doctor.id);
    expect(receptionist.email).toBe('created-receptionist@test.local');
  });
});
