import {
  Injectable,
  Inject,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { SpanStatusCode } from '@opentelemetry/api';
import { Doctor } from '../doctor/doctor.entity';
import { Receptionist } from '../receptionist/receptionist.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { authLoginAttempts, tracer, withSpan } from '../../otel-instruments';

type AuthRole = 'doctor' | 'receptionist';

type TokenUserPayload = {
  sub: string;
  email: string;
  name: string;
  role: AuthRole;
  doctorId?: string;
};

type AuthUserResponse = {
  id: string;
  name: string;
  email: string;
  role: AuthRole;
  doctorId?: string;
  specialization?: string;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject('DOCTOR_REPOSITORY') private doctorRepo: Repository<Doctor>,
    @Inject('RECEPTIONIST_REPOSITORY') private receptionistRepo: Repository<Receptionist>,
    @Inject('REFRESH_TOKEN_REPOSITORY') private refreshTokenRepo: Repository<RefreshToken>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private async hashPassword(password: string) {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateRefreshTokenValue(): string {
    return randomBytes(32).toString('base64url');
  }

  private parseDurationToMs(raw: string | undefined, fallback: string): number {
    const value = raw?.trim() || fallback;
    const match = value.match(/^(\d+)(s|m|h|d)$/i);
    if (match) {
      const amount = Number(match[1]);
      const unit = match[2].toLowerCase();
      const multipliers: Record<string, number> = {
        s: 1_000,
        m: 60_000,
        h: 3_600_000,
        d: 86_400_000,
      };
      return amount * multipliers[unit];
    }

    const asNum = Number(value);
    if (!Number.isNaN(asNum)) return asNum * 1_000;
    return 30 * 86_400_000;
  }

  private getRefreshTokenTtlMs(): number {
    const raw =
      this.configService.get<string>('JWT_REFRESH_EXPIRATION') ??
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN');
    return this.parseDurationToMs(raw, '30d');
  }

  private async issueTokenPair(payload: TokenUserPayload, user: AuthUserResponse) {
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.generateRefreshTokenValue();
    const expiresAt = new Date(Date.now() + this.getRefreshTokenTtlMs());

    await this.refreshTokenRepo.save(
      this.refreshTokenRepo.create({
        tokenHash: this.hashRefreshToken(refreshToken),
        userId: payload.sub,
        role: payload.role,
        expiresAt,
        revokedAt: null,
      }),
    );

    return { accessToken, refreshToken, user };
  }

  private async loadUserById(role: AuthRole, userId: string): Promise<AuthUserResponse | null> {
    if (role === 'receptionist') {
      const receptionist = await this.receptionistRepo.findOne({ where: { id: userId } });
      if (!receptionist) return null;
      return {
        id: receptionist.id,
        name: receptionist.fullName,
        email: receptionist.email,
        role: 'receptionist',
        doctorId: receptionist.doctorId,
      };
    }

    const doctor = await this.doctorRepo.findOne({ where: { id: userId } });
    if (!doctor) return null;
    return {
      id: doctor.id,
      name: doctor.fullName,
      email: doctor.email,
      specialization: doctor.specialization,
      role: 'doctor',
      doctorId: doctor.id,
    };
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

  async login(email: string, password: string, accountType: AuthRole = 'doctor') {
    return withSpan(
      'auth.login',
      async (span) => {
        span.setAttributes({ 'auth.role': accountType });
        try {
          if (accountType === 'receptionist') {
            const receptionist = await this.validateReceptionistCredentials(email, password);
            if (!receptionist) throw new UnauthorizedException('Invalid credentials');

            const payload: TokenUserPayload = {
              sub: receptionist.id,
              email: receptionist.email,
              name: receptionist.fullName,
              role: 'receptionist',
              doctorId: receptionist.doctorId,
            };

            const result = await this.issueTokenPair(payload, {
              id: receptionist.id,
              name: receptionist.fullName,
              email: receptionist.email,
              role: 'receptionist',
              doctorId: receptionist.doctorId,
            });
            authLoginAttempts.add(1, { outcome: 'success', 'auth.role': accountType });
            span.setAttributes({ outcome: 'success' });
            return result;
          }

          const doctor = await this.validateCredentials(email, password);
          if (!doctor) throw new UnauthorizedException('Invalid credentials');

          const payload: TokenUserPayload = {
            sub: doctor.id,
            email: doctor.email,
            name: doctor.fullName,
            role: 'doctor',
          };

          const result = await this.issueTokenPair(payload, {
            id: doctor.id,
            name: doctor.fullName,
            email: doctor.email,
            specialization: doctor.specialization,
            role: 'doctor',
            doctorId: doctor.id,
          });
          authLoginAttempts.add(1, { outcome: 'success', 'auth.role': accountType });
          span.setAttributes({ outcome: 'success' });
          return result;
        } catch (error) {
          authLoginAttempts.add(1, { outcome: 'error', 'auth.role': accountType });
          span.setStatus({ code: SpanStatusCode.ERROR });
          span.setAttributes({
            outcome: 'error',
            'error.type':
              error instanceof UnauthorizedException ? 'invalid_credentials' : 'login_failed',
          });
          throw error;
        }
      },
      { tracer },
    );
  }

  async refresh(refreshToken: string) {
    if (!refreshToken?.trim()) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const tokenHash = this.hashRefreshToken(refreshToken);
    const stored = await this.refreshTokenRepo.findOne({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.loadUserById(stored.role, stored.userId);
    if (!user) {
      stored.revokedAt = new Date();
      await this.refreshTokenRepo.save(stored);
      throw new UnauthorizedException('User no longer exists');
    }

    stored.revokedAt = new Date();
    await this.refreshTokenRepo.save(stored);

    const payload: TokenUserPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      doctorId: user.doctorId,
    };

    return this.issueTokenPair(payload, user);
  }

  async logout(refreshToken?: string) {
    if (!refreshToken?.trim()) return { success: true };

    const tokenHash = this.hashRefreshToken(refreshToken);
    const stored = await this.refreshTokenRepo.findOne({ where: { tokenHash } });
    if (stored && !stored.revokedAt) {
      stored.revokedAt = new Date();
      await this.refreshTokenRepo.save(stored);
    }

    return { success: true };
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
}
