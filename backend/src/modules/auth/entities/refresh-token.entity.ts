import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

// Tests (Jest sets NODE_ENV=test) and the Playwright E2E backend
// (E2E_MODE=true) run on in-memory SQLite, which has no timestamptz.
// Production/dev Postgres keeps timestamptz, matching the migration.
const timestampType =
  process.env.NODE_ENV === 'test' || process.env.E2E_MODE === 'true'
    ? 'datetime'
    : 'timestamptz';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'text' })
  tokenHash!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'text' })
  role!: 'doctor' | 'receptionist';

  @Column({ name: 'expires_at', type: timestampType })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: timestampType, nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
