import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { DataSource, EntityTarget, ObjectLiteral, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Doctor } from '../../src/modules/doctor/doctor.entity';
import { Patient } from '../../src/modules/patient/entities/patient.entity';
import { ClinicalNote } from '../../src/modules/clinical_notes/entity/clinical_notes.entity';
import { Receptionist } from '../../src/modules/receptionist/receptionist.entity';
import { RefreshToken } from '../../src/modules/auth/entities/refresh-token.entity';
import { PatientIntake } from '../../src/modules/intake/entities/patient-intake.entity';
import { Provider } from '@nestjs/common';

export const INTEGRATION_ENTITIES = [
  Doctor,
  Patient,
  ClinicalNote,
  Receptionist,
  RefreshToken,
  PatientIntake,
];

export function repositoryProvider<T extends ObjectLiteral>(
  token: string,
  entity: EntityTarget<T>,
) {
  return {
    provide: token,
    useFactory: (dataSource: DataSource) => dataSource.getRepository(entity),
    inject: [DataSource],
  };
}

export const ALL_REPOSITORY_PROVIDERS = [
  repositoryProvider('DOCTOR_REPOSITORY', Doctor),
  repositoryProvider('PATIENT_REPOSITORY', Patient),
  repositoryProvider('CLINICAL_NOTES_REPOSITORY', ClinicalNote),
  repositoryProvider('RECEPTIONIST_REPOSITORY', Receptionist),
  repositoryProvider('REFRESH_TOKEN_REPOSITORY', RefreshToken),
  repositoryProvider('PATIENT_INTAKE_REPOSITORY', PatientIntake),
];

export async function createIntegrationTestingModule(
  providers: Provider[] = [],
): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      JwtModule.register({
        secret: 'integration-test-secret',
        signOptions: { expiresIn: '1h' },
      }),
      TypeOrmModule.forRoot({
        type: 'sqlite',
        database: ':memory:',
        entities: INTEGRATION_ENTITIES,
        synchronize: true,
        logging: false,
      }),
    ],
    providers: [...ALL_REPOSITORY_PROVIDERS, ...providers],
  }).compile();
}

export async function hashTestPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 4);
}

export async function createTestDoctor(
  dataSource: DataSource,
  overrides: Partial<Doctor> & { password?: string } = {},
): Promise<Doctor> {
  const repo = dataSource.getRepository(Doctor);
  const { password = 'password123', ...rest } = overrides;
  const passwordHash =
    rest.passwordHash ?? (await hashTestPassword(password));

  return repo.save(
    repo.create({
      fullName: 'Dr Integration Test',
      email: `doctor-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`,
      specialization: 'General Medicine',
      ...rest,
      passwordHash,
    }),
  );
}

export async function createTestReceptionist(
  dataSource: DataSource,
  doctorId: string,
  overrides: Partial<Receptionist> & { password?: string } = {},
): Promise<Receptionist> {
  const repo = dataSource.getRepository(Receptionist);
  const { password = 'password123', ...rest } = overrides;
  const passwordHash =
    rest.passwordHash ?? (await hashTestPassword(password));

  return repo.save(
    repo.create({
      fullName: 'Receptionist Test',
      email: `receptionist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`,
      doctorId,
      ...rest,
      passwordHash,
    }),
  );
}

export async function createTestPatient(
  dataSource: DataSource,
  doctorId: string,
  overrides: Partial<Patient> = {},
): Promise<Patient> {
  const repo = dataSource.getRepository(Patient);
  const doctor = await dataSource.getRepository(Doctor).findOneByOrFail({ id: doctorId });

  return repo.save(
    repo.create({
      fullName: 'Test Patient',
      gender: 'female',
      age: '35',
      phone: `98765${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`,
      doctor,
      doctorId,
      ...overrides,
    }),
  );
}

export async function clearIntegrationData(dataSource: DataSource): Promise<void> {
  await dataSource.getRepository(RefreshToken).clear();
  await dataSource.getRepository(PatientIntake).clear();
  await dataSource.getRepository(ClinicalNote).clear();
  await dataSource.getRepository(Patient).clear();
  await dataSource.getRepository(Receptionist).clear();
  await dataSource.getRepository(Doctor).clear();
}

export function getRepo<T extends ObjectLiteral>(
  dataSource: DataSource,
  entity: EntityTarget<T>,
): Repository<T> {
  return dataSource.getRepository(entity);
}
