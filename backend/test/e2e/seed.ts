import { DataSource } from 'typeorm';
import {
  createTestDoctor,
  createTestReceptionist,
} from '../utils/integration-test.helper';

export const E2E_DOCTOR = {
  email: 'e2e-doctor@test.local',
  password: 'E2eDoctor123!',
  fullName: 'E2E Doctor',
} as const;

export const E2E_RECEPTIONIST = {
  email: 'e2e-receptionist@test.local',
  password: 'E2eReceptionist123!',
  fullName: 'E2E Receptionist',
} as const;

export async function seedE2eUsers(dataSource: DataSource) {
  const doctor = await createTestDoctor(dataSource, {
    email: E2E_DOCTOR.email,
    password: E2E_DOCTOR.password,
    fullName: E2E_DOCTOR.fullName,
  });

  await createTestReceptionist(dataSource, doctor.id, {
    email: E2E_RECEPTIONIST.email,
    password: E2E_RECEPTIONIST.password,
    fullName: E2E_RECEPTIONIST.fullName,
  });

  return { doctor };
}
