import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Doctor } from '../../doctor/doctor.entity';
import { Patient } from '../../patient/entities/patient.entity';

@Entity('clinical_notes')
export class ClinicalNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', name: 'patient_details' })
  @Index() // helps searches
  patientDetails: string;

  @Column({ type: 'text', name: 'medical_history' })
  @Index() // helps searches
  medicalHistory: string;

  @Column({ type: 'text', name: 'problems_faced' })
  @Index() // helps searches
  problemsFaced: string;

  @Column({ type: 'varchar', length: 20, name: 'status', default: 'Draft' })
  @Index() // helps searches
  status: string;

  @Column({ type: 'text', name: 'doctor_instructions' })
  @Index() // helps searches
  doctorInstructions: string;

  @Column({ type: 'text', name: 'medication_prescribed' })
  @Index() // helps searches
  medicationPrescribed: string;

  @Column({ type: 'text', name: 'findings', nullable: true })
  @Index() // helps searches
  findings: string;

  @Column({ type: 'text', name: 'diagnosis', nullable: true })
  @Index() // helps searches
  diagnosis: string;

  @Column({ type: 'text', name: 'investigations_advised', nullable: true })
  @Index() // helps searches
  investigationsAdvised: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId: string;

  @Column({ name: 'patient_id', type: 'uuid', nullable: true, default: null })
  patientId: string | null;

  // --- Relations ---
  @ManyToOne(() => Doctor, (doctor) => doctor.clinicalNotes, {
    eager: false,
    onDelete: 'CASCADE', // or 'RESTRICT' if you prefer
  })
  @JoinColumn({ name: 'doctor_id' })
  doctor: Doctor;

  @ManyToOne(() => Patient, (patient) => patient.clinicalNotes, {
    eager: false,
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;



}