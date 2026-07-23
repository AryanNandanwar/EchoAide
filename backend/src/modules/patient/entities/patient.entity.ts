// src/modules/patient/entities/patient.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index, JoinColumn, OneToMany, CreateDateColumn } from 'typeorm';
import { Doctor } from '../../doctor/doctor.entity';
import { ClinicalNote } from 'src/modules/clinical_notes/entity/clinical_notes.entity';

@Entity('patients')
export class Patient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', name: 'full_name' })
  @Index() // helps searches
  fullName: string;

  @Column({ type: 'text', nullable: true, name: 'gender' })
  gender?: string;

  @Column({ type: 'text', nullable: true })
  age?: string;

  @Column({ type: 'text', nullable: true })
  weight?: string;

  @Column({ type: 'text', nullable: true, unique: false, name: 'contact' })
  @Index()
  phone?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Doctor, (doctor) => doctor.patients, {
  onDelete: 'SET NULL', // or 'RESTRICT'
  })
  @JoinColumn({ name: 'doctor_id' })
  doctor: Doctor;

  @Column({ name: 'doctor_id', type: 'uuid', nullable: true })
  doctorId: string;

  @OneToMany(() => ClinicalNote, (clinicalNote) => clinicalNote.patient)
  clinicalNotes: ClinicalNote[];  

}

  
