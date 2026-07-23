import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { ClinicalNotesService } from '../../src/modules/clinical_notes/clinical-notes.service';
import { CreateClinicalNoteDto } from '../../src/modules/clinical_notes/dto/clinical-note.dto';
import {
  clearIntegrationData,
  createIntegrationTestingModule,
  createTestDoctor,
  createTestPatient,
  getRepo,
} from '../utils/integration-test.helper';
import { ClinicalNote } from '../../src/modules/clinical_notes/entity/clinical_notes.entity';

function createNoteDto(overrides: Partial<CreateClinicalNoteDto> = {}): CreateClinicalNoteDto {
  return {
    patientDetails: overrides.patientDetails ?? { name: 'Asha Rao', age: '41' },
    medicalHistory: overrides.medicalHistory ?? ['Diabetes'],
    problemFaced: overrides.problemFaced ?? ['Headache and dizziness'],
    findings: overrides.findings ?? ['BP elevated'],
    diagnosis: overrides.diagnosis ?? ['Hypertension'],
    investigationsAdvised: overrides.investigationsAdvised ?? ['CBC'],
    doctorInstructions: overrides.doctorInstructions ?? ['Follow up in 1 week'],
    medicationPrescribed: overrides.medicationPrescribed ?? ['Amlodipine 5mg'],
    status: overrides.status ?? 'Draft',
    patientId: overrides.patientId,
  };
}

describe('ClinicalNotesService integration', () => {
  let module: TestingModule;
  let service: ClinicalNotesService;
  let dataSource: DataSource;
  let doctorId: string;

  beforeAll(async () => {
    module = await createIntegrationTestingModule([ClinicalNotesService]);
    service = module.get(ClinicalNotesService);
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
  });

  it('creates, reads, updates, and deletes notes for a doctor', async () => {
    const noteId = `note-${Date.now()}`;
    const created = await service.createWithId(createNoteDto(), doctorId, noteId);

    expect(created.id).toBe(noteId);
    expect(created.status).toBe('Draft');

    const listed = await service.findAllForDoctor(doctorId);
    expect(listed).toHaveLength(1);

    const fetched = await service.findOneForDoctor(doctorId, noteId);
    expect(fetched.id).toBe(noteId);

    const updated = await service.updateForDoctor(noteId, { status: 'Confirmed' }, doctorId);
    expect(updated.status).toBe('Confirmed');

    await service.delete(noteId, doctorId);
    await expect(service.findOneForDoctor(doctorId, noteId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('filters notes by status for a doctor', async () => {
    await service.createWithId(createNoteDto(), doctorId, 'draft-note');
    await service.createWithId(createNoteDto(), doctorId, 'confirmed-note');
    await service.updateForDoctor('confirmed-note', { status: 'Confirmed' }, doctorId);

    const drafts = await service.findAllForDoctor(doctorId, 'Draft');
    const confirmed = await service.findAllForDoctor(doctorId, 'Confirmed');

    expect(drafts).toHaveLength(1);
    expect(confirmed).toHaveLength(1);
    expect(drafts[0].id).toBe('draft-note');
    expect(confirmed[0].id).toBe('confirmed-note');
  });

  it('scopes note access to the owning doctor', async () => {
    const otherDoctor = await createTestDoctor(dataSource);
    const noteId = 'scoped-note';
    await service.createWithId(createNoteDto(), doctorId, noteId);

    await expect(service.findOneForDoctor(otherDoctor.id, noteId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('assigns a patient and persists JSON fields correctly', async () => {
    const patient = await createTestPatient(dataSource, doctorId, {
      fullName: 'Asha Rao',
      phone: '9876543210',
    });
    const noteId = 'patient-note';

    await service.createWithId(createNoteDto({ patientId: patient.id }), doctorId, noteId);
    const updated = await service.updateForDoctor(
      noteId,
      { patientId: patient.id, status: 'Confirmed' },
      doctorId,
    );

    expect(updated.patientId).toBe(patient.id);

    const stored = await getRepo(dataSource, ClinicalNote).findOneByOrFail({ id: noteId });
    expect(JSON.parse(stored.patientDetails)).toMatchObject({
      name: 'Asha Rao',
      contact: '9876543210',
    });
    expect(JSON.parse(stored.medicalHistory)).toEqual(['Diabetes']);
    expect(JSON.parse(stored.findings)).toEqual(['BP elevated']);
  });

  it('rejects note creation for a non-existent doctor', async () => {
    await expect(
      service.createWithId(createNoteDto(), 'missing-doctor-id', 'note-1'),
    ).rejects.toThrow('Doctor not found');
  });
});
