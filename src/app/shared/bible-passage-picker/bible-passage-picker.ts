import {
  Component, Input, Output, EventEmitter, OnInit, inject, signal, computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BibleService } from '../../core/services/bible.service';
import { BibleBook, BibleChapterVerses, BiblePassageRef } from '../../core/models/bible.model';

@Component({
  selector: 'app-bible-passage-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bible-passage-picker.html',
  styleUrl: './bible-passage-picker.scss',
})
export class BiblePassagePickerComponent implements OnInit {
  private readonly bibleService = inject(BibleService);

  @Input() passages: BiblePassageRef[] = [];
  @Output() passagesChange = new EventEmitter<BiblePassageRef[]>();
  /** When true, hides Add / Remove controls - passages are display-only. */
  @Input() readonly = false;

  /* ── Book list ── */
  readonly books          = signal<BibleBook[]>([]);
  readonly loadingBooks   = signal(false);

  /* ── Picker state ── */
  readonly pickerOpen     = signal(false);
  readonly selectedBook   = signal<BibleBook | null>(null);
  readonly selectedChapter = signal<number | null>(null);
  readonly chapterVerses  = signal<BibleChapterVerses | null>(null);
  readonly loadingVerses  = signal(false);
  readonly startVerse     = signal<number | null>(null);
  readonly endVerse       = signal<number | null>(null);
  readonly adding         = signal(false);
  readonly addError       = signal<string | null>(null);

  /* ── Derived ── */
  readonly chapterList = computed<number[]>(() => {
    const book = this.selectedBook();
    if (!book) return [];
    return Array.from({ length: book.chaptersCount }, (_, i) => i + 1);
  });

  readonly verseList = computed<number[]>(() => {
    const cv = this.chapterVerses();
    if (!cv) return [];
    return Array.from({ length: cv.versesCount }, (_, i) => i + 1);
  });

  readonly previewPassage = computed<string[]>(() => {
    const cv = this.chapterVerses();
    const start = this.startVerse();
    const end = this.endVerse() ?? start;
    if (!cv || start === null) return [];
    return cv.verses.slice(start - 1, (end ?? start));
  });

  readonly previewRef = computed<string>(() => {
    const book = this.selectedBook();
    const ch = this.selectedChapter();
    const start = this.startVerse();
    const end = this.endVerse();
    if (!book || ch === null || start === null) return '';
    return end && end !== start
      ? `${book.abbrev} ${ch}:${start}-${end}`
      : `${book.abbrev} ${ch}:${start}`;
  });

  readonly canAdd = computed(() =>
    this.selectedBook() !== null &&
    this.selectedChapter() !== null &&
    this.startVerse() !== null &&
    this.previewPassage().length > 0,
  );

  ngOnInit(): void {
    this.loadingBooks.set(true);
    this.bibleService.getBooks().subscribe({
      next: (books) => { this.books.set(books); this.loadingBooks.set(false); },
      error: () => this.loadingBooks.set(false),
    });
  }

  openPicker(): void {
    this.pickerOpen.set(true);
    this.addError.set(null);
  }

  closePicker(): void {
    this.pickerOpen.set(false);
    this.resetPicker();
  }

  onBookChange(abbrev: string): void {
    const book = this.books().find((b) => b.abbrev === abbrev) ?? null;
    this.selectedBook.set(book);
    this.selectedChapter.set(null);
    this.chapterVerses.set(null);
    this.startVerse.set(null);
    this.endVerse.set(null);
  }

  onChapterChange(chapter: number): void {
    const book = this.selectedBook();
    if (!book) return;
    this.selectedChapter.set(chapter);
    this.startVerse.set(null);
    this.endVerse.set(null);
    this.chapterVerses.set(null);
    this.loadingVerses.set(true);
    this.bibleService.getVerses(book.abbrev, chapter).subscribe({
      next: (cv) => { this.chapterVerses.set(cv); this.loadingVerses.set(false); },
      error: () => this.loadingVerses.set(false),
    });
  }

  addPassage(): void {
    const ref = this.previewRef();
    const passage = this.previewPassage();
    if (!ref || !passage.length) return;
    const updated = [...this.passages, { ref, passage }];
    this.passagesChange.emit(updated);
    this.closePicker();
  }

  removePassage(index: number): void {
    const updated = this.passages.filter((_, i) => i !== index);
    this.passagesChange.emit(updated);
  }

  getVerseNumber(ref: string, index: number): number {
    // Parse start verse from ref like "Heb 2:4-5" or "Gen 1:1"
    const match = ref.match(/:(\d+)/);
    const start = match ? parseInt(match[1], 10) : 1;
    return start + index;
  }

  private resetPicker(): void {
    this.selectedBook.set(null);
    this.selectedChapter.set(null);
    this.chapterVerses.set(null);
    this.startVerse.set(null);
    this.endVerse.set(null);
    this.addError.set(null);
  }
}
