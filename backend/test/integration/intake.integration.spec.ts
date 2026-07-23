import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { IntakeService } from '../../src/modules/intake/intake.service';
import {
  clearIntegrationData,
  createIntegrationTestingModule,
  createTestDoctor,
  createTestPatient,
  createTestReceptionist,
  getRepo,
} from '../utils/integration-test.helper';
import { Patient } from '../../src/modules/patient/entities/patient.entity';

describe('IntakeService integration', () => {
  let module: TestingModule;
  let service: IntakeService;
  let dataSource: DataSource;
  let doctorId: string;
  let receptionistId: string;

  beforeAll(async () => {
    module = await createIntegrationTestingModule([IntakeService]);
    service = module.get(IntakeService);
    dataSource = module.get(DataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
    await module.close();
  });

  beforeEach(async () => {
    await clearIntegrationData(dataSource);
    const doctor = await createTestDoctor(dataSource);
    doctorId = doctor.id;
    receptionistId = (await createTestReceptionist(dataSource, doctorId)).id;
  });

  it('creates an intake and patient from receptionist data', async () => {
    const intake = await service.createPatientIntake(
      doctorId,
      {
        fullName: 'Queue Patient',
        gender: 'female',
        age: '32',
        weight: '60 kg',
        phone: '9876543210',
      },
      receptionistId,
    );

    expect(intake.status).toBe('pending');
    expect(intake.patient.fullName).toBe('Queue Patient');
    expect(intake.receptionistId).toBe(receptionistId);
  });

  it('upserts an existing patient when phone matches', async () => {
    await createTestPatient(dataSource, doctorId, {
      fullName: 'Old Name',
      phone: '9876543210',
      age: '30',
    });

    const intake = await service.createPatientIntake(
      doctorId,
      {
        fullName: 'Updated Name',
        gender: 'female',
        age: '32',
        weight: '62 kg',
        phone: '9876543210',
      },
      receptionistId,
    );

    const patients = await getRepo(dataSource, Patient).find({ where: { doctorId } });
    expect(patients).toHaveLength(1);
    expect(patients[0].fullName).toBe('Updated Name');
    expect(patients[0].age).toBe('32');
    expect(intake.patientId).toBe(patients[0].id);
  });

  it('lists pending queue items for a doctor', async () => {
    await service.createPatientIntake(
      doctorId,
      { fullName: 'Pending One', gender: 'male', age: '40', phone: '9000000001' },
      receptionistId,
    );
    await service.createPatientIntake(
      doctorId,
      { fullName: 'Pending Two', gender: 'female', age: '41', phone: '9000000002' },
      receptionistId,
    );

    const queue = await service.listQueueForDoctor(doctorId, 'pending');
    expect(queue).toHaveLength(2);
    expect(queue[0].patient.fullName).toBe('Pending One');
  });

  it('updates intake status for a doctor', async () => {
    const intake = await service.createPatientIntake(
      doctorId,
      { fullName: 'Status Patient', gender: 'male', age: '45', phone: '9000000003' },
      receptionistId,
    );

    const updated = await service.updateStatusForDoctor(doctorId, intake.id, 'in_progress');
    expect(updated.status).toBe('in_progress');
  });

  it('rejects receptionist not assigned to the doctor', async () => {
    const otherDoctor = await createTestDoctor(dataSource);
    const foreignReceptionist = await createTestReceptionist(dataSource, otherDoctor.id);

    await expect(
      service.createPatientIntake(
        doctorId,
        { fullName: 'Bad Intake', gender: 'male', age: '20', phone: '9000000004' },
        foreignReceptionist.id,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects queue updates for intakes owned by another doctor', async () => {
    const otherDoctor = await createTestDoctor(dataSource);
    const intake = await service.createPatientIntake(
      doctorId,
      { fullName: 'Foreign Intake', gender: 'male', age: '20', phone: '9000000005' },
      receptionistId,
    );

    await expect(
      service.updateStatusForDoctor(otherDoctor.id, intake.id, 'completed'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
