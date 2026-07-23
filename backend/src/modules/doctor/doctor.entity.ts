import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, ManyToMany,  OneToMany } from 'typeorm';
import { Patient } from '../patient/entities/patient.entity';
import { ClinicalNote } from '../clinical_notes/entity/clinical_notes.entity';

@Entity('doctors')
export class Doctor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 255 })
  fullName!: string;

  @Index({ unique: true })
  @Column({ length: 255 })
  email!: string;

  @Column({ length: 20, nullable: true })
  contactNo?: string;

  @Column({ length: 255, nullable: true })
  specialization?: string;

  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @OneToMany(() => ClinicalNote, (clinicalNote) => clinicalNote.doctor)
  clinicalNotes?: ClinicalNote[];

  @OneToMany(() => Patient, (patient) => patient.doctor)
  patients?: Patient[];

}
