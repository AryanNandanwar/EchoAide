import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClinicalNotesService } from '../../src/modules/clinical_notes/clinical-notes.service';
import { ClinicalNote } from '../../src/modules/clinical_notes/entity/clinical_notes.entity';
import { Doctor } from '../../src/modules/doctor/doctor.entity';
import { Patient } from '../../src/modules/patient/entities/patient.entity';
import { DatabaseTestHelper } from '../utils/database-test.helper';
import { MockDataGenerator } from '../utils/mock-data.generator';
import { CreateClinicalNoteDto } from '../../src/modules/clinical_notes/dto/clinical-note.dto';
import { type ParsedNote } from '../../src/modules/streaming/schemas/parsed-note.schema';

// Helper function to create simple test DTO
function createTestDto(overrides?: Partial<CreateClinicalNoteDto>): CreateClinicalNoteDto {
  return {
    patientDetails: overrides?.patientDetails || {},
    medicalHistory: overrides?.medicalHistory || [],
    problemFaced: overrides?.problemFaced || [],
    findings: overrides?.findings || [],
    diagnosis: overrides?.diagnosis || [],
    investigationsAdvised: overrides?.investigationsAdvised || [],
    doctorInstructions: overrides?.doctorInstructions || [],
    medicationPrescribed: overrides?.medicationPrescribed || [],
    status: overrides?.status || 'Draft',
  };
}

describe('ClinicalNotes Integration Tests', () => {
  let module: TestingModule;
  let service: ClinicalNotesService;
  let dataSource: DataSource;
  let dbHelper: DatabaseTestHelper;
  let testDoctor: Doctor;

  beforeAll(async () => {
    // Create test database configuration
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [ClinicalNote, Doctor, Patient],
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([ClinicalNote, Doctor, Patient]),
      ],
      providers: [ClinicalNotesService],
    }).compile();

    service = module.get<ClinicalNotesService>(ClinicalNotesService);
    dataSource = module.get<DataSource>(DataSource);
    dbHelper = new DatabaseTestHelper(dataSource);

    // Create test doctor
    testDoctor = await dbHelper.createTestDoctor();
  });

  afterAll(async () => {
    await dbHelper.cleanupAllTestData();
    await dataSource.destroy();
    await module.close();
  });

  beforeEach(async () => {
    // Clean up any existing test data
    await dbHelper.cleanupAllTestData();
    // Recreate test doctor
    testDoctor = await dbHelper.createTestDoctor();
  });

  describe('Clinical Note Creation', () => {
    it('should create a clinical note with valid data', async () => {
      const mockTranscript = MockDataGenerator.getTranscript('cardiology-simple');
      const noteId = MockDataGenerator.createMockNoteId();
      
      const createDto = createTestDto({
        patientDetails: {
          age: '45',
          gender: 'male',
          chiefComplaint: 'chest pain'
        },
        medicalHistory: ['hypertension', 'smoker'],
        problemFaced: ['chest pain for 2 days, sharp, central chest, worsens with activity'],
        findings: ['BP 140/90', 'HR 88', 'no murmurs', 'ECG normal sinus rhythm'],
        diagnosis: ['stable angina'],
        investigationsAdvised: ['cardiac stress test', 'lipid panel'],
        doctorInstructions: ['follow up in 2 weeks'],
        medicationPrescribed: ['aspirin 81mg daily', 'nitroglycerin as needed'],
      });

      const createdNote = await service.createWithId(createDto, testDoctor.id, noteId);

      expect(createdNote).toBeDefined();
      expect(createdNote.id).toBe(noteId);
      expect(createdNote.doctor.id).toBe(testDoctor.id);
      expect(createdNote.status).toBe('Draft');

      // Verify note was stored correctly in database
      const storedNote = await dbHelper.findClinicalNote(noteId);
      expect(storedNote).toBeDefined();
      expect(storedNote?.id).toBe(noteId);
      expect(dbHelper.validateClinicalNoteStructure(storedNote!)).toBe(true);
    });

    it('should handle note creation with minimal data', async () => {
      const mockTranscript = MockDataGenerator.getTranscript('minimal-data');
      const noteId = MockDataGenerator.createMockNoteId();
      
      const createDto = createTestDto({
        patientDetails: {},
        medicalHistory: ['Not mentioned'],
        problemFaced: ['follow up visit, doing well, no complaints'],
        findings: ['Not mentioned'],
        diagnosis: ['Not mentioned'],
        investigationsAdvised: ['Not mentioned'],
        doctorInstructions: ['continue current treatment'],
        medicationPrescribed: ['Not mentioned'],
      });

      const createdNote = await service.createWithId(createDto, testDoctor.id, noteId);

      expect(createdNote).toBeDefined();
      expect(createdNote.id).toBe(noteId);
      
      const storedNote = await dbHelper.findClinicalNote(noteId);
      expect(storedNote).toBeDefined();
      expect(dbHelper.validateClinicalNoteStructure(storedNote!)).toBe(true);
    });

    it('should reject note creation for non-existent doctor', async () => {
      const noteId = MockDataGenerator.createMockNoteId();
      const createDto: CreateClinicalNoteDto = {
        patientDetails: {},
        medicalHistory: [],
        problemFaced: [],
        findings: [],
        diagnosis: [],
        investigationsAdvised: [],
        doctorInstructions: [],
        medicationPrescribed: [],
        status: 'Draft',
      };

      await expect(service.createWithId(createDto, 'non-existent-doctor', noteId))
        .rejects.toThrow('Doctor not found');
    });

    it('should store JSON fields correctly', async () => {
      const noteId = MockDataGenerator.createMockNoteId();
      const createDto = createTestDto({
        patientDetails: {
          name: 'John Doe',
          age: '45',
          gender: 'male',
          contact: 'john@example.com',
          emergencyContact: 'Jane Doe - 555-0123'
        },
        medicalHistory: ['hypertension', 'diabetes type 2', 'previous heart attack'],
        problemFaced: ['chest pain and shortness of breath'],
        findings: ['BP 160/95', 'HR 110', 'irregular heartbeat', 'crackles in lungs'],
        diagnosis: ['acute myocardial infarction', 'hypertensive crisis'],
        investigationsAdvised: ['ECG', 'cardiac enzymes', 'chest X-ray', 'echocardiogram'],
        doctorInstructions: ['immediate hospital admission', 'cardiac monitoring', 'nitroglycerin infusion'],
        medicationPrescribed: ['aspirin 325mg', 'clopidogrel 75mg', 'metoprolol 25mg', 'lisinopril 10mg'],
      });

      const createdNote = await service.createWithId(createDto, testDoctor.id, noteId);
      const storedNote = await dbHelper.findClinicalNote(noteId);

      expect(storedNote).toBeDefined();
      
      // Verify JSON parsing works correctly
      const parsedPatientDetails = JSON.parse(storedNote!.patientDetails);
      expect(parsedPatientDetails.name).toBe('John Doe');
      expect(parsedPatientDetails.age).toBe('45');

      const parsedMedicalHistory = JSON.parse(storedNote!.medicalHistory);
      expect(parsedMedicalHistory).toEqual(['hypertension', 'diabetes type 2', 'previous heart attack']);
    });
  });

  describe('Clinical Note Retrieval', () => {
    let testNotes: ClinicalNote[];

    beforeEach(async () => {
      // Create multiple test notes
      testNotes = [];
      const transcripts = MockDataGenerator.getAllTranscripts();
      
      for (let i = 0; i < 3; i++) {
        const noteId = MockDataGenerator.createMockNoteId();
        
        const createDto = createTestDto({
          patientDetails: { age: `${30 + i}`, gender: 'test' },
          medicalHistory: ['test condition'],
          problemFaced: [`test problem ${i}`],
          findings: ['test finding'],
          diagnosis: ['test diagnosis'],
          investigationsAdvised: ['test investigation'],
          doctorInstructions: ['test instruction'],
          medicationPrescribed: ['test medication'],
        });

        const note = await service.createWithId(createDto, testDoctor.id, noteId);
        testNotes.push(note);
      }
    });

    it('should retrieve all notes for a doctor', async () => {
      const notes = await service.findAllForDoctor(testDoctor.id);
      
      expect(notes).toHaveLength(3);
      expect(notes.every(note => note.doctor.id === testDoctor.id)).toBe(true);
    });

    it('should retrieve a specific note for a doctor', async () => {
      const targetNote = testNotes[0];
      const retrievedNote = await service.findOneForDoctor(testDoctor.id, targetNote.id);
      
      expect(retrievedNote).toBeDefined();
      expect(retrievedNote?.id).toBe(targetNote.id);
      expect(retrievedNote?.doctor.id).toBe(testDoctor.id);
    });

    it('should throw error when accessing non-existent note', async () => {
      await expect(service.findOneForDoctor(testDoctor.id, 'non-existent-note'))
        .rejects.toThrow('Clinical note not found for this doctor');
    });

    it('should find note by ID', async () => {
      const targetNote = testNotes[0];
      const retrievedNote = await service.findById(targetNote.id);
      
      expect(retrievedNote).toBeDefined();
      expect(retrievedNote?.id).toBe(targetNote.id);
    });
  });

  describe('Clinical Note Updates', () => {
    let testNote: ClinicalNote;

    beforeEach(async () => {
      const noteId = MockDataGenerator.createMockNoteId();
      
      const createDto = createTestDto({
        patientDetails: { age: '8', gender: 'male' },
        medicalHistory: ['asthma'],
        problemFaced: ['persistent cough and wheezing'],
        findings: ['wheezing sounds', 'reduced breath sounds'],
        diagnosis: ['asthma exacerbation'],
        investigationsAdvised: ['chest X-ray', 'pulmonary function test'],
        doctorInstructions: ['use inhaler as needed', 'avoid allergens'],
        medicationPrescribed: ['albuterol inhaler', 'prednisone 5mg'],
      });

      testNote = await service.createWithId(createDto, testDoctor.id, noteId);
    });

    it('should update note fields correctly', async () => {
      const updateDto = {
        problemFaced: ['Updated problem description'],
        diagnosis: ['Updated diagnosis 1', 'Updated diagnosis 2'],
        status: 'Confirmed' as const,
      };

      const updatedNote = await service.updateForDoctor(testNote.id, updateDto, testDoctor.id);

      expect(updatedNote.problemsFaced).toBe('Updated problem description');
      expect(updatedNote.status).toBe('Confirmed');
      
      // Verify in database
      const storedNote = await dbHelper.findClinicalNote(testNote.id);
      const parsedProblems = JSON.parse(storedNote!.problemsFaced);
      expect(parsedProblems).toBe('Updated problem description');
    });

    it('should assign patient to note', async () => {
      const testPatient = await dbHelper.createTestPatient();
      
      const updateDto = {
        patientId: testPatient.id,
        status: 'Confirmed' as const,
      };

      const updatedNote = await service.updateForDoctor(testNote.id, updateDto, testDoctor.id);

      expect(updatedNote.patient?.id).toBe(testPatient.id);
      expect(updatedNote.patientId).toBe(testPatient.id);
    });

    it('should reject patient assignment for non-existent patient', async () => {
      const updateDto = {
        patientId: 'non-existent-patient',
      };

      await expect(service.updateForDoctor(testNote.id, updateDto, testDoctor.id))
        .rejects.toThrow('Patient not found');
    });
  });

  describe('Data Integrity and Validation', () => {
    it('should handle special characters in medical data', async () => {
      const noteId = MockDataGenerator.createMockNoteId();
      const createDto = createTestDto({
        patientDetails: {
          name: 'José García',
          allergies: 'Penicillin, sulfa drugs, "special" medication',
          notes: 'Patient has history of "complicated" medical conditions'
        },
        medicalHistory: ['Type 2 Diabetes™', 'Hypertension (Stage 2)', 'Previous surgery: appendectomy (2020)'],
        problemFaced: ['Patient reports "sharp" pain in chest, described as "pressure-like" sensation'],
        findings: ['BP: 140/90 mmHg', 'HR: 88 bpm', 'Temp: 37.2°C', 'O2 sat: 98%'],
        diagnosis: ['Essential hypertension', 'Type 2 diabetes mellitus'],
        investigationsAdvised: ['CBC with differential', 'CMP', 'HbA1c', 'Lipid panel'],
        doctorInstructions: ['Follow DASH diet', 'Exercise 30 min/day', 'Monitor blood pressure at home'],
        medicationPrescribed: ['Lisinopril 10mg daily', 'Metformin 500mg BID'],
      });

      const createdNote = await service.createWithId(createDto, testDoctor.id, noteId);
      const storedNote = await dbHelper.findClinicalNote(noteId);

      expect(storedNote).toBeDefined();
      expect(dbHelper.validateClinicalNoteStructure(storedNote!)).toBe(true);

      // Verify special characters are preserved
      const parsedPatientDetails = JSON.parse(storedNote!.patientDetails);
      expect(parsedPatientDetails.name).toBe('José García');
      expect(parsedPatientDetails.allergies).toContain('Penicillin');
    });

    it('should handle empty arrays and objects gracefully', async () => {
      const noteId = MockDataGenerator.createMockNoteId();
      const createDto: CreateClinicalNoteDto = {
        patientDetails: {},
        medicalHistory: [],
        problemFaced: [],
        findings: [],
        diagnosis: [],
        investigationsAdvised: [],
        doctorInstructions: [],
        medicationPrescribed: [],
        status: 'Draft',
      };

      const createdNote = await service.createWithId(createDto, testDoctor.id, noteId);
      const storedNote = await dbHelper.findClinicalNote(noteId);

      expect(storedNote).toBeDefined();
      expect(dbHelper.validateClinicalNoteStructure(storedNote!)).toBe(true);

      // Verify empty data is stored correctly
      const parsedPatientDetails = JSON.parse(storedNote!.patientDetails);
      expect(parsedPatientDetails).toEqual({});

      const parsedMedicalHistory = JSON.parse(storedNote!.medicalHistory);
      expect(parsedMedicalHistory).toEqual([]);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle bulk note creation efficiently', async () => {
      const startTime = Date.now();
      const noteIds: string[] = [];

      for (let i = 0; i < 50; i++) {
        const noteId = MockDataGenerator.createMockNoteId();
        noteIds.push(noteId);
        
        const createDto = createTestDto({
          patientDetails: { age: `${20 + i}`, gender: 'test' },
          medicalHistory: ['test condition'],
          problemFaced: [`test problem ${i}`],
          findings: ['test finding'],
          diagnosis: ['test diagnosis'],
          investigationsAdvised: ['test investigation'],
          doctorInstructions: ['test instruction'],
          medicationPrescribed: ['test medication'],
        });

        await service.createWithId(createDto, testDoctor.id, noteId);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(noteIds).toHaveLength(50);

      // Verify all notes were created
      const notes = await service.findAllForDoctor(testDoctor.id);
      expect(notes).toHaveLength(50);

      // Clean up
      for (const noteId of noteIds) {
        await service.delete(noteId, testDoctor.id);
      }
    });
  });
});
