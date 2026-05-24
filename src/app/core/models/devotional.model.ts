import { BiblePassageRef } from './bible.model';

export interface Devotional {
  _id: string;
  day: number;
  month: number;
  year: number;
  title: string;
  themeScripture: string;
  preparatoryQuestions: string[];
  author?: string;
  content: string;
  furtherReading: string;
  questionsToHelpYouMeditate: string[];
  prayer: string;
  oneYearBiblePlan: string;
  biblePassages?: BiblePassageRef[];
  listOfImageAssets?: string[];
  published: boolean;
  fileUrl?: string;
  fileKey?: string;
  hits?: number;
  createdAt?: string;
  updatedAt?: string;
}

export function devotionalDate(d: Devotional): Date {
  return new Date(d.year, d.month - 1, d.day);
}

export const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

export interface ExtractedDevotional {
  title: string;
  author: string;
  themeScripture: string;
  preparatoryQuestions: string[];
  content: string;
  furtherReading: string;
  questionsToHelpYouMeditate: string[];
  prayer: string;
  oneYearBiblePlan: string;
  listOfImageAssets: string[];
  biblePassages: BiblePassageRef[];
}
