import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BibleBook, BibleChapterVerses, BiblePassageRef } from '../models/bible.model';

@Injectable({ providedIn: 'root' })
export class BibleService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/bible`;

  getBooks(): Observable<BibleBook[]> {
    return this.http.get<BibleBook[]>(`${this.base}/books`);
  }

  getVerses(abbrev: string, chapter: number): Observable<BibleChapterVerses> {
    return this.http.get<BibleChapterVerses>(`${this.base}/${abbrev}/chapters/${chapter}/verses`);
  }

  getPassage(abbrev: string, chapter: number, start: number, end: number): Observable<BiblePassageRef> {
    return this.http.get<BiblePassageRef>(
      `${this.base}/${abbrev}/chapters/${chapter}/passage?start=${start}&end=${end}`,
    );
  }
}
