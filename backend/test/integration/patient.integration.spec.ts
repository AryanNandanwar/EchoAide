import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { PatientService } from '../../src/modules/patient/patient.service';
import {
  clearIntegrationData,
  createIntegrationTestingModule,
  createTestDoctor,
  createTestPatient,
} from '../utils/integration-test.helper';

describe('PatientService integration', () => {
  let module: TestingModule;
  let service: PatientService;
  let dataSource: DataSource;
  let doctorId: string;
  let otherDoctorId: string;

  beforeAll(async () => {
    module = await createIntegrationTestingModule([PatientService]);
    service = module.get(PatientService);
    dataSource = module.get(DataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
    await module.close();
  });

  beforeEach(async () => {
    await clearIntegrationData(dataSource);
    doctorId = (await createTestDoctor(dataSource)).id;
    otherDoctorId = (await createTestDoctor(dataSource)).id;
  });

  it('creates and retrieves a patient for a doctor', async () => {
    const created = await service.createForDoctor(doctorId, {
      fullName: 'Asha Rao',
      gender: 'female',
      age: '41',
      phone: '+91 98765-43210',
    });

    expect(created.fullName).toBe('Asha Rao');
    expect(created.phone).toBe('+919876543210');

    const fetched = await service.findByIdForDoctor(doctorId, created.id);
    expect(fetched.id).toBe(created.id);
  });

  it('prevents a doctor from reading another doctor patient', async () => {
    const patient = await createTestPatient(dataSource, doctorId, { fullName: 'Private Patient' });

    await expect(service.findByIdForDoctor(otherDoctorId, patient.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates and deletes patients within doctor scope', async () => {
    const patient = await createTestPatient(dataSource, doctorId, {
      fullName: 'Before Update',
      phone: '9000000001',
    });

    const updated = await service.updateForDoctor(doctorId, patient.id, {
      fullName: 'After Update',
      weight: '68 kg',
    });
    expect(updated.fullName).toBe('After Update');
    expect(updated.weight).toBe('68 kg');

    await service.deleteForDoctor(doctorId, patient.id);
    await expect(service.findByIdForDoctor(doctorId, patient.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('searches patients by name or phone for a doctor', async () => {
    await createTestPatient(dataSource, doctorId, {
      fullName: 'Asha Rao',
      phone: '9876543210',
    });
    await createTestPatient(dataSource, doctorId, {
      fullName: 'John Smith',
      phone: '9123456789',
    });
    await createTestPatient(dataSource, otherDoctorId, {
      fullName: 'Asha Rao',
      phone: '9876543210',
    });

    const byName = await service.searchForDoctor(doctorId, 'Asha');
    const byPhone = await service.searchForDoctor(doctorId, '9876');

    expect(byName).toHaveLength(1);
    expect(byPhone).toHaveLength(1);
    expect(byName[0].fullName).toBe('Asha Rao');
  });

  it('matches patients by exact phone number', async () => {
    const patient = await createTestPatient(dataSource, doctorId, {
      fullName: 'Phone Match',
      phone: '+919876543210',
    });

    const matches = await service.findMatchesForDoctor(doctorId, {
      fullName: 'Different Name',
      phone: '+91 98765-43210',
    });

    expect(matches).toHaveLength(1);
    expect(matches[0].patientId).toBe(patient.id);
    expect(matches[0].matchScore).toBe(1);
    expect(matches[0].matchedOn).toContain('phone');
  });

  it('matches patients by partial name when fuzzy search is unavailable', async () => {
    const patient = await createTestPatient(dataSource, doctorId, {
      fullName: 'Asha Rao',
      gender: 'female',
    });

    const matches = await service.findMatchesForDoctor(doctorId, {
      fullName: 'Asha',
      gender: 'female',
    });

    expect(matches.some((match) => match.patientId === patient.id)).toBe(true);
    expect(
      matches.find((match) => match.patientId === patient.id)?.matchedOn.some((field) =>
        field.includes('fullName'),
      ),
    ).toBe(true);
  });
});
