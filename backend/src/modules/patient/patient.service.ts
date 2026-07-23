// src/modules/patient/patient.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Inject,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { Patient } from './entities/patient.entity';
import { CreatePatientDto, UpdatePatientDto } from './dto/patient.dto';
import { normalizePhone } from 'src/utils/phone.utils';
import { Doctor } from '../doctor/doctor.entity';

type MatchResult = {
  patientId: string;
  fullName: string;
  gender?: string | null;
  phone?: string | null;
  matchScore: number;
  matchedOn: string[];
};

@Injectable()
export class PatientService {
  constructor(
    @Inject('PATIENT_REPOSITORY')
    private readonly patientRepo: Repository<Patient>,

    @Inject('DOCTOR_REPOSITORY')
    private readonly doctorRepo: Repository<Doctor>,
  ) {}

  // -------------------------------
  // CREATE: patient for a doctor
  // -------------------------------
  async createForDoctor(doctorId: string, dto: CreatePatientDto): Promise<Patient> {
    const doctor = await this.doctorRepo.findOne({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException('Doctor not found');

    const payload: Partial<Patient> = {
      fullName: dto.fullName,
      gender: dto.gender,
      age: dto.age,
      weight: dto.weight,
      phone: dto.phone ? normalizePhone(dto.phone) : undefined,
      doctor,      // relation
      doctorId,    // FK column
    };

    try {
      const patient = this.patientRepo.create(payload);
      return await this.patientRepo.save(patient);
    } catch (err: any) {
      throw new BadRequestException(err?.message ?? 'Failed to create patient');
    }
  }

  // Optional convenience: if you want `create()` to be doctor-scoped:
  async create(doctorId: string, dto: CreatePatientDto): Promise<Patient> {
    return this.createForDoctor(doctorId, dto);
  }

  // -------------------------------
  // READ: single patient for doctor
  // -------------------------------
  async findByIdForDoctor(doctorId: string, patientId: string): Promise<Patient> {
    const p = await this.patientRepo.findOne({
      where: { id: patientId, doctorId },
    });
    if (!p) throw new NotFoundException('Patient not found for this doctor');
    return p;
  }

  // If you still want a doctor-agnostic version:
  async findById(id: string): Promise<Patient> {
    const p = await this.patientRepo.findOneBy({ id });
    if (!p) throw new NotFoundException('Patient not found');
    return p;
  }

  // -------------------------------
  // UPDATE: patient for doctor
  // -------------------------------
  async updateForDoctor(
    doctorId: string,
    patientId: string,
    dto: UpdatePatientDto,
  ): Promise<Patient> {
    const patient = await this.findByIdForDoctor(doctorId, patientId);

    if (dto.phone) dto.phone = normalizePhone(dto.phone);

    Object.assign(patient, dto);
    return this.patientRepo.save(patient);
  }

  // keep old signature if you still use it somewhere else
  async update(id: string, dto: UpdatePatientDto): Promise<Patient> {
    const p = await this.findById(id);
    if (dto.phone) dto.phone = normalizePhone(dto.phone);
    Object.assign(p, dto);
    return this.patientRepo.save(p);
  }

  // -------------------------------
  // DELETE: patient for doctor
  // -------------------------------
  async deleteForDoctor(doctorId: string, patientId: string): Promise<void> {
    const result = await this.patientRepo.delete({ id: patientId, doctorId });
    if (!result.affected || result.affected === 0) {
      throw new NotFoundException('Patient not found for this doctor');
    }
  }

  // -------------------------------
  // LIST / SEARCH: patients of a doctor
  // -------------------------------
  async findPatientsForDoctor(doctorId: string, limit = 1000): Promise<Patient[]> {
    return this.patientRepo
      .createQueryBuilder('p')
      .where('p.doctorId = :doctorId', { doctorId })
      .orderBy('p.createdAt', 'DESC')
      .limit(limit)
      .getMany();
  }

  async searchForDoctor(doctorId: string, q: string, limit = 1000): Promise<Patient[]> {
    if (!q) return [];

    return this.patientRepo
      .createQueryBuilder('p')
      .where('p.doctorId = :doctorId', { doctorId })
      .andWhere(
        '(LOWER(p.fullName) LIKE LOWER(:q) OR p.phone LIKE :q)',
        { q: `%${q}%` },
      )
      .orderBy('p.createdAt', 'DESC')
      .limit(limit)
      .getMany();
  }

  // Old unscoped search if needed:
  async search(q: string, limit = 1000): Promise<Patient[]> {
    if (!q) return [];

    return this.patientRepo
      .createQueryBuilder('p')
      .where('LOWER(p.fullName) LIKE LOWER(:q)', { q: `%${q}%` })
      .orWhere('p.phone LIKE :q', { q: `%${q}%` })
      .orderBy('p.createdAt', 'DESC')
      .limit(limit)
      .getMany();
  }



  // -------------------------------
  // MATCHES: scoped to a doctor's patients
  // -------------------------------
  async findMatchesForDoctor(
    doctorId: string,
    extracted: Partial<CreatePatientDto>,
    limit = 1000,
  ): Promise<MatchResult[]> {
    const candidates: Array<{ patient: Patient; score: number; matchedOn: string[] }> = [];

    try {

      console.log("Extracted data",extracted);

      // 1) Exact phone match
      if (extracted.phone) {
        const normalizedPhone = normalizePhone(extracted.phone);
        if (normalizedPhone) {
          const byPhone = await this.patientRepo.findOne({
            where: { phone: normalizedPhone, doctorId },
          });
          if (byPhone) candidates.push({ patient: byPhone, score: 1.0, matchedOn: ['phone'] });
        }
      }

      // 2) Exact fullName + gender
      if (extracted.fullName && extracted.gender) {
        const byNameGender = await this.patientRepo.findOne({
          where: {
            fullName: extracted.fullName,
            gender: extracted.gender,
            doctorId,
          },
        });
        if (byNameGender) {
          candidates.push({
            patient: byNameGender,
            score: 0.95,
            matchedOn: ['fullName', 'gender'],
          });
        }
      }

      // 3) Fuzzy fullName using pg_trgm, scoped to doctor
      if (extracted.fullName) {
        try {
          const raw = await this.patientRepo
            .createQueryBuilder('p')
            .select([
              'p.id AS id',
              'p.fullName AS fullName',
              'p.phone AS phone',
              'p.gender AS gender',
            ])
            .where('p.doctorId = :doctorId', { doctorId })
            .andWhere('p.fullName % :name', { name: extracted.fullName })
            .orderBy('similarity(p.fullName, :name)', 'DESC')
            .setParameter('name', extracted.fullName)
            .limit(limit)
            .getRawMany();

          for (const r of raw) {
            const id = r.id ?? r.p_id;
            if (!id) continue;
            const patient = await this.patientRepo.findOne({
              where: { id, doctorId },
            });
            if (patient) {
              candidates.push({
                patient,
                score: 0.6,
                matchedOn: ['fullName_fuzzy'],
              });
            }
          }
        } catch {
          // fallback: partial name match when pg_trgm is unavailable
          const like = await this.patientRepo
            .createQueryBuilder('p')
            .where('p.doctorId = :doctorId', { doctorId })
            .andWhere('LOWER(p.fullName) LIKE LOWER(:n)', { n: `%${extracted.fullName}%` })
            .limit(limit)
            .getMany();

          for (const p of like) {
            candidates.push({
              patient: p,
              score: 0.5,
              matchedOn: ['fullName_partial'],
            });
          }
        }
      }

      // Dedupe & sort
      const map = new Map<string, { patient: Patient; score: number; matchedOn: Set<string> }>();
      for (const c of candidates) {
        const id = c.patient.id;
        if (!id) continue;
        const existing = map.get(id);
        if (!existing) {
          map.set(id, { patient: c.patient, score: c.score, matchedOn: new Set(c.matchedOn) });
        } else {
          if (c.score > existing.score) existing.score = c.score;
          c.matchedOn.forEach(m => existing.matchedOn.add(m));
        }
      }

      const result: MatchResult[] = Array.from(map.values())
        .map(x => ({
          patientId: x.patient.id,
          fullName: x.patient.fullName,
          gender: x.patient.gender ?? null,
          phone: x.patient.phone ?? null,
          matchScore: Number(x.score.toFixed(3)),
          matchedOn: Array.from(x.matchedOn),
        }))
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, limit);

      return result;
    } catch (err: any) {
      throw new InternalServerErrorException(
        err?.message ?? 'Error while searching patient matches',
      );
    }
  }
}
