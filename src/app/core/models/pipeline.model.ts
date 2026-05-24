import { BiblePassageRef } from './bible.model';
import { ExtractedDevotional } from '../models/devotional.model';

export type PipelineStageId =
  | 'idle'
  | 'reading'
  | 'converting'
  | 'normalizing'
  | 'extracting-sections'
  | 'processing-markup'
  | 'fetching-bible'
  | 'extracting-images'
  | 'uploading-image'
  | 'beautifying'
  | 'saving'
  | 'complete'
  | 'error';

export interface PipelineProgress {
  stage: PipelineStageId;
  message: string;
  detail?: string;
  /** 0–100 overall progress */
  progress?: number;
  imageTask?: { current: number; total: number };
  bibleTask?: { current: number; total: number };
  /** Final processed HTML — set when stage === 'complete' */
  result?: string;
  /** Extracted & fetched Bible passages — set when stage === 'complete' */
  biblePassages?: BiblePassageRef[];
  /** Set when stage === 'error' */
  error?: string;
  /** Extracted devotional fields — set when stage === 'complete' (devotional pipeline) */
  extracted?: ExtractedDevotional;
}
