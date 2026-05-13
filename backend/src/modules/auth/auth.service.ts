import { Injectable, Inject, UnauthorizedException, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Doctor } from '../doctor/doctor.entity';
import { Receptionist } from '../receptionist/receptionist.entity';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    @Inject('DOCTOR_REPOSITORY') private doctorRepo: Repository<Doctor>,
    @Inject('RECEPTIONIST_REPOSITORY') private receptionistRepo: Repository<Receptionist>,
    private jwtService: JwtService,
  ) {}

  private async hashPassword(password: string) {
    const saltRounds = 12; // 12 is a reasonable default
    return bcrypt.hash(password, saltRounds);
  }

  async signup(payload: {
    fullName: string;
    email: string;
    password: string;
    contactNo?: string;
    specialization?: string;
  }) {
    const existingDoctor = await this.doctorRepo.findOne({ where: { email: payload.email } });
    const existingReceptionist = await this.receptionistRepo.findOne({ where: { email: payload.email } });
    if (existingDoctor || existingReceptionist) throw new ConflictException('Email already registered');

    const passwordHash = await this.hashPassword(payload.password);
    const doctor = this.doctorRepo.create({
      fullName: payload.fullName,
      email: payload.email,
      passwordHash,
      contactNo: payload.contactNo,
      specialization: payload.specialization,
    });
    await this.doctorRepo.save(doctor);

    // Optionally send verification email here
    const { passwordHash: _, ...safe } = doctor as any;
    return safe;
  }

  async signupReceptionist(payload: {
    fullName: string;
    email: string;
    password: string;
    doctorId: string;
  }) {
    if (!payload.doctorId?.trim()) {
      throw new BadRequestException('doctorId is required');
    }
    const parentDoctor = await this.doctorRepo.findOne({ where: { id: payload.doctorId } });
    if (!parentDoctor) throw new NotFoundException('Doctor not found');

    const existingDoctor = await this.doctorRepo.findOne({ where: { email: payload.email } });
    const existingReceptionist = await this.receptionistRepo.findOne({ where: { email: payload.email } });
    if (existingDoctor || existingReceptionist) throw new ConflictException('Email already registered');

    const passwordHash = await this.hashPassword(payload.password);
    const receptionist = this.receptionistRepo.create({
      fullName: payload.fullName,
      email: payload.email,
      passwordHash,
      doctorId: payload.doctorId,
    });

    const saved = await this.receptionistRepo.save(receptionist);

    // Optionally send verification email here
    const { passwordHash: _, ...safe } = saved as any;
    return safe;
  }

  async validateCredentials(email: string, password: string) {
    const doctor = await this.doctorRepo.findOne({ where: { email } });

    if (!doctor) return null;
    if (typeof password !== 'string' || !password || typeof doctor.passwordHash !== 'string') return null;
    const ok = await bcrypt.compare(password, doctor.passwordHash);

    if (!ok) return null;
    return doctor;
  }

  async validateReceptionistCredentials(email: string, password: string) {
    const receptionist = await this.receptionistRepo.findOne({ where: { email } });
    if (!receptionist) return null;
    if (typeof password !== 'string' || !password || typeof receptionist.passwordHash !== 'string') return null;

    const ok = await bcrypt.compare(password, receptionist.passwordHash);
    if (!ok) return null;

    return receptionist;
  }

  async login(email: string, password: string, accountType: 'doctor' | 'receptionist' = 'doctor') {
    if (accountType === 'receptionist') {
      const receptionist = await this.validateReceptionistCredentials(email, password);
      if (!receptionist) throw new UnauthorizedException('Invalid credentials');

      const payload = {
        sub: receptionist.id,
        email: receptionist.email,
        name: receptionist.fullName,
        role: 'receptionist',
        doctorId: receptionist.doctorId,
      };
      const token = this.jwtService.sign(payload);

      return {
        accessToken: token,
        user: {
          id: receptionist.id,
          name: receptionist.fullName,
          email: receptionist.email,
          role: 'receptionist',
          doctorId: receptionist.doctorId,
        },
      };
    }

    const doctor = await this.validateCredentials(email, password);
    if (!doctor) throw new UnauthorizedException('Invalid credentials');

    const payload = { sub: doctor.id, email: doctor.email, name: doctor.fullName, role: 'doctor' };
    const token = this.jwtService.sign(payload);

    return {
      accessToken: token,
      user: {
        id: doctor.id,
        name: doctor.fullName,
        email: doctor.email,
        specialization: doctor.specialization,
        role: 'doctor',
        doctorId: doctor.id,
      },
    };
  }

  async createReceptionist(doctorId: string, payload: {
    fullName: string;
    email: string;
    password: string;
  }) {
    const doctor = await this.doctorRepo.findOne({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException('Doctor not found');

    const existingDoctor = await this.doctorRepo.findOne({ where: { email: payload.email } });
    const existingReceptionist = await this.receptionistRepo.findOne({ where: { email: payload.email } });
    if (existingDoctor || existingReceptionist) throw new ConflictException('Email already registered');

    const passwordHash = await this.hashPassword(payload.password);
    const receptionist = this.receptionistRepo.create({
      fullName: payload.fullName,
      email: payload.email,
      passwordHash,
      doctorId,
    });
    const saved = await this.receptionistRepo.save(receptionist);
    const { passwordHash: _, ...safe } = saved as any;
    return safe;
  }

  async logout(){
    
  }
}
