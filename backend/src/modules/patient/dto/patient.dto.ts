// src/modules/patient/dto/create-patient.dto.ts
import { IsString, IsOptional, IsPhoneNumber, IsIn } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreatePatientDto {
  @IsString()
  fullName!: string;

  @IsOptional()
  @IsIn(['male', 'female', 'other'])
  gender?: 'male' | 'female' | 'other';

  @IsOptional()
  @IsString()
  age?: string;

  @IsOptional()
  // We store normalized phone but validate loosely here; consider libphonenumber for stricter validation
  @IsString()
  @IsPhoneNumber()
  phone?: string;

  doctorId?: string;
}

export class UpdatePatientDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsIn(['male', 'female', 'other'])
  gender?: 'male' | 'female' | 'other';

  @IsOptional()
  @IsString()
  age?: string;

  @IsOptional()
  @IsString()
  @IsPhoneNumber()
  phone?: string;

  doctorId?: string;
}


export class MatchPatientDto extends PartialType(CreatePatientDto) {}