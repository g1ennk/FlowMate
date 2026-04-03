import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

export const REPORT_TYPES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export interface ReportContent {
  keep: string;
  problem: string;
  try: string;
  referenceQuestion?: string;
}

@Entity('reports')
@Unique(['userId', 'type', 'periodStart'])
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'varchar', length: 10 })
  type: ReportType;

  @Column({ name: 'period_start', type: 'date' })
  periodStart: string;

  @Column({ type: 'jsonb' })
  content: ReportContent;

  @Column({
    name: 'prompt_version',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  promptVersion: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
