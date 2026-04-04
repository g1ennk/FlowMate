import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

// REPORT_TYPES를 상수로 분리해 DTO·서비스에서 재사용 — 타입 추가 시 이 파일만 수정
export const REPORT_TYPES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export interface ReportContent {
  keep: string;
  problem: string;
  try: string;
  referenceQuestion?: string; // optional
}

@Entity('reports')
// 동일 유저·타입·기간 중복 레포트를 DB 레벨에서 방지
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
