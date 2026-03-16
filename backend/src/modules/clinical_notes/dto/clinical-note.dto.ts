// dto/create-clinical-note.dto.ts
import {
  IsArray,
  IsOptional,
  IsString,
  IsObject,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateClinicalNoteDto {
  @IsOptional()
  @IsObject()
  patientDetails?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  medicalHistory?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    // accept "foo" or ["foo", "bar"] and always store as array
    if (value == null) return undefined;
    return Array.isArray(value) ? value : [value];
  })
  problemFaced?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  doctorInstructions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  medicationPrescribed?: string[];

  patientId: string;
}
