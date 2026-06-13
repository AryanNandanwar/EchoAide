// src/clinical_notes/modules/clinical-notes/clinical-notes.service.ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CreateClinicalNoteDto } from './dto/clinical-note.dto';
import { UpdateClinicalNoteDto } from './dto/update-clinical-note.dto';
import { Repository } from 'typeorm';
import { ClinicalNote } from './entity/clinical_notes.entity';
import { Doctor } from '../doctor/doctor.entity';
import { Patient } from '../patient/entities/patient.entity';


@Injectable()
export class ClinicalNotesService {
  constructor(
    @Inject('CLINICAL_NOTES_REPOSITORY')
    private readonly notesCollection: Repository<ClinicalNote>,

    @Inject('DOCTOR_REPOSITORY')
    private readonly doctorRepo: Repository<Doctor>,

    @Inject('PATIENT_REPOSITORY')
    private readonly patientRepo: Repository<Patient>,

  ) {}

  async create(dto: CreateClinicalNoteDto, doctorId: string): Promise<ClinicalNote> {

    const doctor = await this.doctorRepo.findOne({ where: { id: doctorId } });
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    const patient = dto.patientId
      ? await this.patientRepo.findOne({ where: { id: dto.patientId, doctorId } })
      : null;
    if (dto.patientId && !patient) {
      throw new NotFoundException('Patient not found for this doctor');
    }

    const payload: Partial<ClinicalNote> = {
      patientDetails: JSON.stringify(this.resolvePatientDetails(dto.patientDetails, patient)),
      medicalHistory: dto.medicalHistory ? JSON.stringify(dto.medicalHistory) : '[]',
      problemsFaced: dto.problemFaced ? JSON.stringify(dto.problemFaced) : '[]',
      doctorInstructions: dto.doctorInstructions ? JSON.stringify(dto.doctorInstructions) : '[]',
      medicationPrescribed: dto.medicationPrescribed ? JSON.stringify(dto.medicationPrescribed) : '[]',
      findings: dto.findings ? JSON.stringify(dto.findings) : '[]',
      diagnosis: dto.diagnosis ? JSON.stringify(dto.diagnosis) : '[]',
      investigationsAdvised: dto.investigationsAdvised ? JSON.stringify(dto.investigationsAdvised) : '[]',
      doctor: doctor,
      patient: patient ?? undefined,
      patientId: patient?.id ?? null,
      status: 'Draft',
    };  

    console.log('Creating clinical note with payload:', payload);

    const note = this.notesCollection.create(payload);
    return await this.notesCollection.save(note);
  }

  async createWithId(dto: CreateClinicalNoteDto, doctorId: string, noteId: string): Promise<ClinicalNote> {
    const doctor = await this.doctorRepo.findOne({ where: { id: doctorId } });
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    const patient = dto.patientId
      ? await this.patientRepo.findOne({ where: { id: dto.patientId, doctorId } })
      : null;
    if (dto.patientId && !patient) {
      throw new NotFoundException('Patient not found for this doctor');
    }

    const payload: Partial<ClinicalNote> = {
      id: noteId, // Set the specific ID
      patientDetails: JSON.stringify(this.resolvePatientDetails(dto.patientDetails, patient)),
      medicalHistory: dto.medicalHistory ? JSON.stringify(dto.medicalHistory) : '[]',
      problemsFaced: dto.problemFaced ? JSON.stringify(dto.problemFaced) : '[]',
      doctorInstructions: dto.doctorInstructions ? JSON.stringify(dto.doctorInstructions) : '[]',
      medicationPrescribed: dto.medicationPrescribed ? JSON.stringify(dto.medicationPrescribed) : '[]',
      findings: dto.findings ? JSON.stringify(dto.findings) : '[]',
      diagnosis: dto.diagnosis ? JSON.stringify(dto.diagnosis) : '[]',
      investigationsAdvised: dto.investigationsAdvised ? JSON.stringify(dto.investigationsAdvised) : '[]',
      doctor: doctor,
      patient: patient ?? undefined,
      patientId: patient?.id ?? null,
      status: 'Draft',
    };

    console.log('Creating clinical note with specific ID:', { noteId, payload });

    const note = this.notesCollection.create(payload);
    console.log('🔍 Note entity created before save:', { id: note.id, patientDetails: note.patientDetails });
    
    const savedNote = await this.notesCollection.save(note);
    console.log('✅ Note saved successfully:', { id: savedNote.id, createdAt: savedNote.createdAt });
    
    return savedNote;
  }

   async findAllForDoctor(doctorId: string, status?: string): Promise<ClinicalNote[]> {
    const where: { doctor: { id: string }; status?: string } = {
      doctor: { id: doctorId },
    };
    if (status) {
      where.status = status;
    }

    return this.notesCollection.find({
      where,
      relations: ['doctor', 'patient'],
      order: { createdAt: 'DESC' },
    });
  }

  // Get a single note that belongs to a specific doctor
  async findOneForDoctor(doctorId: string, noteId: string): Promise<ClinicalNote> {
    const note = await this.notesCollection.findOne({
      where: {
        id: noteId,
        doctor: { id: doctorId },
      },
      relations: ['doctor', 'patient'],
    });

    if (!note) {
      throw new NotFoundException('Clinical note not found for this doctor');
    }

    return note;
  }

  async findById(id: string): Promise<ClinicalNote> {
    const note = await this.notesCollection.findOneBy({ id });
    if (!note) {
      throw new NotFoundException('Clinical note not found');
    }
    return note;
  } 

  async updateForDoctor(id: string, dto: UpdateClinicalNoteDto, doctorId: string): Promise<ClinicalNote> {
    const note = await this.findOneForDoctor(doctorId, id)

    if (dto.patientDetails !== undefined) {
      note.patientDetails = JSON.stringify(dto.patientDetails);
    }
    if (dto.medicalHistory !== undefined) {
      note.medicalHistory = JSON.stringify(dto.medicalHistory);
    }
    if (dto.problemFaced !== undefined) {
      note.problemsFaced = JSON.stringify(dto.problemFaced);
    }
    if (dto.doctorInstructions !== undefined) {
      note.doctorInstructions = JSON.stringify(dto.doctorInstructions);
    }
    if (dto.medicationPrescribed !== undefined) {
      note.medicationPrescribed = JSON.stringify(dto.medicationPrescribed);
    }
    if (dto.findings !== undefined) {
      note.findings = JSON.stringify(dto.findings);
    }
    if (dto.diagnosis !== undefined) {
      note.diagnosis = JSON.stringify(dto.diagnosis);
    }
    if (dto.investigationsAdvised !== undefined) {
      note.investigationsAdvised = JSON.stringify(dto.investigationsAdvised);
    }
    if (dto.status !== undefined) {
      note.status = dto.status;
    }

    // Handle patient assignment
    if (dto.patientId !== undefined && dto.patientId) {
      // Assign patient to note
      const patient = await this.patientRepo.findOne({ where: { id: dto.patientId, doctorId } });
      if (!patient) {
        throw new NotFoundException('Patient not found for this doctor');
      }
      note.patient = patient;
      note.patientId = dto.patientId;
      note.patientDetails = JSON.stringify(this.resolvePatientDetails(dto.patientDetails, patient));
      console.log(`✅ Assigned patient ${dto.patientId} to clinical note ${id}`);
    }

    return await this.notesCollection.save(note);
  }

  async delete(id: string, doctorId: string): Promise<void> {
    const note = await this.findOneForDoctor(doctorId, id); // throws if not found / not owned
    await this.notesCollection.remove(note);
  }

  async getNotesCountForPatient(doctorId: string, patientId: string): Promise<{ count: number }> {
    const count = await this.notesCollection.count({
      where: {
        doctor: { id: doctorId },
        patient: { id: patientId },
      },
    });
    return { count };
  }

  async getNotesSummaryForPatient(doctorId: string, patientId: string): Promise<any[]> {
    const notes = await this.notesCollection.find({
      where: {
        doctor: { id: doctorId },
        patient: { id: patientId },
      },
      relations: ['patient'],
      select: ['id', 'createdAt', 'medicalHistory', 'problemsFaced', 'findings', 'diagnosis'],
      order: { createdAt: 'DESC' },
    });

    return notes.map(note => ({
      id: note.id,
      createdAt: note.createdAt,
      summary: this.generateNoteSummary(note),
    }));
  }

  private generateNoteSummary(note: ClinicalNote): string {
    const medicalHistory = this.parseJsonField(note.medicalHistory);
    const problemsFaced = this.parseJsonField(note.problemsFaced);
    const findings = this.parseJsonField(note.findings);
    const diagnosis = this.parseJsonField(note.diagnosis);
    
    let summary = '';
    if (medicalHistory && medicalHistory.length > 0) {
      summary += `History: ${medicalHistory.slice(0, 2).join(', ')}`;
    }
    if (problemsFaced && problemsFaced.length > 0) {
      if (summary) summary += ' | ';
      summary += `Issues: ${problemsFaced.slice(0, 2).join(', ')}`;
    }
    if (findings && findings.length > 0) {
      if (summary) summary += ' | ';
      summary += `Findings: ${findings.slice(0, 2).join(', ')}`;
    }
    if (diagnosis && diagnosis.length > 0) {
      if (summary) summary += ' | ';
      summary += `Diagnosis: ${diagnosis.slice(0, 2).join(', ')}`;
    }
    
    return summary || 'Clinical visit note';
  }

  private parseJsonField(field: string): string[] {
    try {
      const parsed = JSON.parse(field);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return field ? [field] : [];
    }
  }

  private resolvePatientDetails(
    generatedDetails: Record<string, string> | undefined,
    patient: Patient | null,
  ): Record<string, string> {
    const generated = generatedDetails ?? {};
    if (!patient) return generated;

    return {
      ...generated,
      name: patient.fullName ?? generated.name ?? '',
      gender: patient.gender ?? generated.gender ?? '',
      age: patient.age ?? generated.age ?? '',
      weight: patient.weight ?? generated.weight ?? '',
      contact: patient.phone ?? generated.contact ?? '',
    };
  }

}
