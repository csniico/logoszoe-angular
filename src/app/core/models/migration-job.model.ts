export interface MigrationDetail {
  collection: string;
  documentId: string;
  field: string;
  fromBucket: string;
  fromKey: string;
  toKey: string;
  status: 'migrated' | 'failed';
  error?: string;
}

export interface MigrationJob {
  _id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  total: number;
  migrated: number;
  skipped: number;
  failedCount: number;
  details: MigrationDetail[];
  startedAt?: string;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}
