import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BibleService } from '../../core/services/bible.service';
import { BibleBook, BibleChapterVerses } from '../../core/models/bible.model';

@Component({
  selector: 'app-bible',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bible.html',
  styleUrl: './bible.scss',
})
export class BibleComponent implements OnInit {
  private readonly bibleService = inject(BibleService);

  // ── Books ─────────────────────────────────────────────────────────────────
  readonly books        = signal<BibleBook[]>([]);
  readonly loadingBooks = signal(true);
  readonly errorBooks   = signal<string | null>(null);
  readonly searchQuery  = signal('');

  // ── Selected book / chapters ──────────────────────────────────────────────
  readonly selectedBook    = signal<BibleBook | null>(null);
  readonly loadingChapters = signal(false);

  // ── Selected chapter / verses ─────────────────────────────────────────────
  readonly selectedChapter = signal<number | null>(null);   // 1-based
  readonly verseData       = signal<BibleChapterVerses | null>(null);
  readonly loadingVerses   = signal(false);
  readonly errorVerses     = signal<string | null>(null);

  // ── Computed ──────────────────────────────────────────────────────────────
  readonly filteredBooks = computed<BibleBook[]>(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.books();
    return this.books().filter(
      (b) => b.name.toLowerCase().includes(q) || b.abbrev.toLowerCase().includes(q),
    );
  });

  /** OT = first 39 books, NT = books 40-66 by position in the full books array */
  readonly otBooks = computed<BibleBook[]>(() => {
    const all = this.books();
    return this.filteredBooks().filter((b) => all.indexOf(b) < 39);
  });

  readonly ntBooks = computed<BibleBook[]>(() => {
    const all = this.books();
    return this.filteredBooks().filter((b) => all.indexOf(b) >= 39);
  });

  /** Array of chapter indices [1 … chaptersCount] for the selected book */
  readonly chapterNumbers = computed<number[]>(() => {
    const book = this.selectedBook();
    if (!book) return [];
    return Array.from({ length: book.chaptersCount }, (_, i) => i + 1);
  });

  readonly verses = computed<string[]>(() => this.verseData()?.verses ?? []);

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.bibleService.getBooks().subscribe({
      next:  (data) => { this.books.set(data); this.loadingBooks.set(false); },
      error: ()     => { this.errorBooks.set('Failed to load Bible books.'); this.loadingBooks.set(false); },
    });
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  selectBook(book: BibleBook): void {
    this.selectedBook.set(book);
    this.selectedChapter.set(null);
    this.verseData.set(null);
    this.errorVerses.set(null);
  }

  selectChapter(chapterIndex: number): void {
    const book = this.selectedBook();
    if (!book) return;

    this.selectedChapter.set(chapterIndex);
    this.verseData.set(null);
    this.errorVerses.set(null);
    this.loadingVerses.set(true);

    this.bibleService.getVerses(book.abbrev, chapterIndex).subscribe({
      next:  (data) => { this.verseData.set(data); this.loadingVerses.set(false); },
      error: ()     => { this.errorVerses.set('Failed to load verses.'); this.loadingVerses.set(false); },
    });
  }

  clearBook(): void {
    this.selectedBook.set(null);
    this.selectedChapter.set(null);
    this.verseData.set(null);
    this.errorVerses.set(null);
    this.searchQuery.set('');
  }

  clearChapter(): void {
    this.selectedChapter.set(null);
    this.verseData.set(null);
    this.errorVerses.set(null);
  }

  /** Returns array of verse index numbers [1, 2, …] for use in template */
  verseIndices(): number[] {
    return this.verses().map((_, i) => i + 1);
  }
}
