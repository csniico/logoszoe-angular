export interface BibleBook {
  _id?: string;
  name: string;
  abbrev: string;
  chaptersCount: number;
}

export interface BibleChapterVerses {
  versesCount: number;
  verses: string[];
}

export interface BiblePassageRef {
  ref: string;      // e.g. "Heb 2:4-5"
  passage: string[]; // ["verse text 1", "verse text 2"]
}
