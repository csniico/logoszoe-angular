import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { html as htmlBeautify } from 'js-beautify';
import { StorageService } from './storage.service';
import { BibleService } from './bible.service';
import { PipelineProgress } from '../models/pipeline.model';
import { BibleBook, BiblePassageRef } from '../models/bible.model';

// ── Internal types for Bible passage parsing ──────────────────────────────────

interface BibleChapterRange {
  number: number;
  startVerse?: number;
  endVerse?: number;
  /**
   * true  → fetch only `startVerse` (single-verse ref like "Acts 16:6")
   * false → fetch from `startVerse` to `endVerse` (or to chapter end when endVerse is absent)
   */
  singleVerse?: boolean;
}

/** Raw parse result — no DOM reference yet */
interface ParsedRefData {
  book: string;
  chapters: BibleChapterRange[];
}

/** Full ref used during fetch — includes display text and the span to update */
interface ParsedBibleRef extends ParsedRefData {
  displayRef: string;
  spanEl: Element;
}

// ── Bible book name index ─────────────────────────────────────────────────────
//
// Every canonical name, common title variant, and standard abbreviation for all
// 66 books. Sorted longest → shortest so the regex alternation always matches
// the most specific form first (e.g. "1 Corinthians" before "1 Cor").

const BIBLE_BOOK_NAMES: readonly string[] = ([
  // ── Old Testament ──────────────────────────────────────────────
  'Song of Solomon', 'Song of Songs',
  '1 Thessalonians', '2 Thessalonians',
  '1 Corinthians',   '2 Corinthians',
  '1 Chronicles',    '2 Chronicles',
  'Deuteronomy', 'Ecclesiastes', 'Lamentations', 'Philippians',
  '1 Timothy', '2 Timothy',
  '1 Samuel',  '2 Samuel',
  'Galatians', 'Colossians', 'Ephesians', 'Revelation',
  'Zechariah', 'Habakkuk',   'Zephaniah',
  '1 Peter',   '2 Peter',
  'Obadiah',   'Nehemiah',   'Leviticus',
  '1 Kings',   '2 Kings',
  'Proverbs',  'Numbers',    'Genesis',   'Matthew',
  'Hebrews',   'Ezekiel',
  '1 John',    '2 John',     '3 John',
  'Psalms', 'Psalm', 'Joshua', 'Judges',
  'Isaiah',  'Romans', 'Daniel', 'Exodus',
  'Haggai',  'Micah',  'Nahum',  'Malachi',
  'Jonah',   'Hosea',  'Philemon',
  'Ezra', 'Ruth', 'Acts', 'Joel', 'Amos',
  'Titus', 'Mark', 'Luke', 'John', 'Jude', 'Job',
  // ── Abbreviations (OT) ─────────────────────────────────────────
  '1 Chron', '2 Chron',
  '1 Thess', '2 Thess',
  '1 Cor',   '2 Cor',
  '1 Chr',   '2 Chr',
  '1 Tim',   '2 Tim',
  '1 Sam',   '2 Sam',
  '1 Kgs',   '2 Kgs',
  '1 Pet',   '2 Pet',
  '1 Jn',    '2 Jn',  '3 Jn',
  'Deut', 'Deu', 'Eccl', 'Ecc', 'Lam',
  'Phil', 'Rev', 'Eph', 'Gal', 'Col',
  'Zech', 'Zec', 'Hab', 'Zeph', 'Zep',
  'Obad', 'Neh', 'Lev',
  'Ezek', 'Eze', 'Prov', 'Pro', 'Num',
  'Gen', 'Matt', 'Mt', 'Heb',
  'Josh', 'Jos', 'Judg', 'Jdg',
  'Psa', 'Ps',
  'Isa', 'Rom', 'Dan', 'Hag', 'Mic', 'Mal',
  'Jon', 'Hos', 'Ezr',
  'Exod', 'Exo', 'Ex',
  'Phm', 'Rth',
  'Mk', 'Lk', 'Jn',
] as const).slice().sort((a, b) => b.length - a.length);

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class DocumentPipelineService {
  private readonly storage      = inject(StorageService);
  private readonly bibleService = inject(BibleService);

  // ── Regex caches ────────────────────────────────────────────────────────────

  /** Cached source string for the Bible-reference detection pattern. */
  private _bibleRefSource = '';

  /**
   * Returns the regex source (no flags) that matches a bare Bible reference
   * such as "John 3:16", "1 Cor 13:4-7", "Acts 2", "2 Sam 22:1-23:10".
   *
   * Uses a negative lookbehind/lookahead to avoid matching mid-word.
   */
  private getBibleRefSource(): string {
    if (!this._bibleRefSource) {
      const bookAlt = BIBLE_BOOK_NAMES
        .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
        .join('|');

      // BookName[.]?  chapter  [:verse[-[chapter:]endVerse]]
      this._bibleRefSource =
        `(?<!\\w)(?:${bookAlt})\\.?\\s+` +
        `\\d{1,3}(?::\\d{1,3}(?:[-\\u2013](?:\\d{1,3}:)?\\d{1,3})?)?` +
        `(?!\\w)`;
    }
    return this._bibleRefSource;
  }

  /**
   * Returns a fresh combined regex (new instance so lastIndex is always 0)
   * that matches, in priority order:
   *   1. **bold text**   → blockquote
   *   2. $$BibleRef$$    → explicit bible-ref span
   *   3. General BibleRef → implicit bible-ref span
   */
  private newCombinedRe(): RegExp {
    return new RegExp(
      `\\*\\*.+?\\*\\*|\\$\\$.+?\\$\\$|${this.getBibleRefSource()}`,
      'gis',
    );
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Process a Word (.docx) or PDF file through the full pipeline.
   * Emits PipelineProgress; final emission has stage 'complete',
   * result = formatted HTML, biblePassages = fetched passage objects.
   */
  process(file: File, imageKeyPrefix: string): Observable<PipelineProgress> {
    return new Observable<PipelineProgress>((subscriber) => {
      this.run(file, imageKeyPrefix, (p) => subscriber.next(p))
        .then(() => subscriber.complete())
        .catch((err: unknown) => {
          subscriber.next({
            stage: 'error',
            message: 'Pipeline failed',
            error: err instanceof Error ? err.message : String(err),
          });
          subscriber.complete();
        });
    });
  }

  /**
   * Process raw HTML content (no file conversion, no image upload).
   * Emits PipelineProgress events — normalising → detecting → fetching → beautifying → complete.
   * The 'complete' event carries `result` (cleaned HTML) and `biblePassages`.
   */
  processHtmlContent(html: string): Observable<PipelineProgress> {
    return new Observable<PipelineProgress>((subscriber) => {
      this.runHtmlContent(html, (p) => subscriber.next(p))
        .then(() => subscriber.complete())
        .catch((err: unknown) => {
          subscriber.next({
            stage: 'error',
            message: 'Processing failed',
            error: err instanceof Error ? err.message : String(err),
          });
          subscriber.complete();
        });
    });
  }

  // ── Pipeline orchestrator (file) ──────────────────────────────────────────

  private async run(
    file: File,
    imageKeyPrefix: string,
    emit: (p: PipelineProgress) => void,
  ): Promise<void> {
    // Stage 1 — Read
    emit({ stage: 'reading', message: 'Reading document…', progress: 5 });
    const buffer = await file.arrayBuffer();

    // Stage 2 — Convert to raw HTML
    emit({ stage: 'converting', message: 'Converting document to HTML…', progress: 18 });
    const rawHtml = await this.convertToHtml(file, buffer);

    // Stage 3 — Normalise (AST walk)
    emit({ stage: 'normalizing', message: 'Normalising HTML structure…', progress: 33 });
    const doc = this.parseAndNormalize(rawHtml);

    // Stage 4 — Markup: **…** → blockquote, $$…$$/bare-ref → bible-ref span + collect refs
    // (existingPassages is always empty for freshly converted files)
    emit({ stage: 'processing-markup', message: 'Detecting Bible references…', progress: 45 });
    const { parsedRefs } = this.applyMarkup(doc);

    // Stage 5 — Fetch Bible passage content
    let biblePassages: BiblePassageRef[] = [];
    if (parsedRefs.length > 0) {
      emit({
        stage: 'fetching-bible',
        message: `Loading books list…`,
        progress: 50,
        bibleTask: { current: 0, total: parsedRefs.length },
      });

      let books: BibleBook[] = [];
      try { books = await firstValueFrom(this.bibleService.getBooks()); } catch { /* continue without passages */ }

      for (let i = 0; i < parsedRefs.length; i++) {
        const ref = parsedRefs[i];
        emit({
          stage: 'fetching-bible',
          message: `Fetching "${ref.displayRef}" (${i + 1} of ${parsedRefs.length})…`,
          progress: 50 + Math.round((i / parsedRefs.length) * 12),
          bibleTask: { current: i + 1, total: parsedRefs.length },
        });
        try {
          const fetched = await this.fetchPassageRef(ref, books);
          if (fetched) biblePassages.push(fetched);
        } catch { /* skip this ref */ }
      }
    }

    // Stage 6 — Upload embedded base64 images
    const imgEls = Array.from(doc.querySelectorAll('img[src^="data:"]'));
    if (imgEls.length > 0) {
      emit({
        stage: 'extracting-images',
        message: `Found ${imgEls.length} embedded image${imgEls.length > 1 ? 's' : ''} — uploading…`,
        progress: 63,
        imageTask: { current: 0, total: imgEls.length },
      });
      for (let i = 0; i < imgEls.length; i++) {
        const el = imgEls[i] as HTMLImageElement;
        emit({
          stage: 'uploading-image',
          message: `Uploading image ${i + 1} of ${imgEls.length}…`,
          progress: 63 + Math.round((i / imgEls.length) * 25),
          imageTask: { current: i + 1, total: imgEls.length },
        });
        try {
          const fileObj = this.base64ToFile(el.src, `${imageKeyPrefix}/img-${i + 1}`);
          const result  = await firstValueFrom(
            this.storage.uploadFile(fileObj, `${imageKeyPrefix}/content`),
          );
          el.src = result.fileUrl;
          el.removeAttribute('data-src');
        } catch {
          el.parentElement?.removeChild(el);
        }
      }
    }

    // Stage 7 — Serialise + beautify
    emit({ stage: 'beautifying', message: 'Finalising HTML…', progress: 92 });
    const finalHtml = htmlBeautify(doc.body.innerHTML, {
      indent_size: 2,
      wrap_line_length: 120,
      end_with_newline: true,
    });

    emit({
      stage: 'complete',
      message: 'Document ready',
      progress: 100,
      result: finalHtml,
      biblePassages,
    });
  }

  // ── Pipeline orchestrator (HTML content) ────────────────────────────────────

  private async runHtmlContent(
    html: string,
    emit: (p: PipelineProgress) => void,
  ): Promise<void> {
    // 1. Parse + normalise
    emit({ stage: 'normalizing', message: 'Normalising HTML structure…', progress: 10 });
    const doc = this.parseAndNormalize(html);

    // 2. Detect & wrap Bible refs.
    //    `existingPassages` holds refs that were already fetched in a prior save
    //    (identified by a JSON data-ref attribute on the old spans).
    emit({ stage: 'processing-markup', message: 'Detecting Bible references…', progress: 25 });
    const { parsedRefs, existingPassages } = this.applyMarkup(doc);

    // 3. Build a per-key group map so each unique ref is handled exactly once,
    //    even when the same verse appears multiple times in the document.
    //
    //    Key = ref text normalised to lower-case (e.g. "john 3:16")
    //    Value = all span elements in the doc that carry that ref
    const refGroups = new Map<string, { displayRef: string; spans: Element[]; parsed: ParsedBibleRef }>();
    for (const ref of parsedRefs) {
      const key = ref.displayRef.trim().toLowerCase();
      if (!refGroups.has(key)) {
        refGroups.set(key, { displayRef: ref.displayRef, spans: [], parsed: ref });
      }
      refGroups.get(key)!.spans.push(ref.spanEl);
    }

    // Split into cached (already have verse text) and new (need API fetch)
    const biblePassages: BiblePassageRef[] = [];
    const toFetch: Array<{ key: string; displayRef: string; spans: Element[]; parsed: ParsedBibleRef }> = [];

    for (const [key, group] of refGroups) {
      const cached = existingPassages.get(key);
      if (cached) {
        // Restore the JSON data-ref on every span and carry the passage forward
        const json = JSON.stringify({ ref: cached.ref, text: cached.passage });
        for (const span of group.spans) span.setAttribute('data-ref', json);
        biblePassages.push(cached);
      } else {
        toFetch.push({ key, ...group });
      }
    }

    // 4. Fetch only the genuinely new refs
    if (toFetch.length > 0) {
      let books: BibleBook[] = [];
      try { books = await firstValueFrom(this.bibleService.getBooks()); } catch { /* skip */ }

      for (let i = 0; i < toFetch.length; i++) {
        const { displayRef, spans, parsed } = toFetch[i];
        emit({
          stage: 'fetching-bible',
          message: `Fetching "${displayRef}"…`,
          progress: 30 + Math.round((i / toFetch.length) * 55),
          bibleTask: { current: i + 1, total: toFetch.length },
        });
        try {
          const fetched = await this.fetchPassageRef(parsed, books);
          if (fetched) {
            biblePassages.push(fetched);
            // Stamp every in-document occurrence of this ref
            const json = JSON.stringify({ ref: fetched.ref, text: fetched.passage });
            for (const span of spans) span.setAttribute('data-ref', json);
          }
        } catch { /* skip this ref */ }
      }
    }

    // 5. Beautify
    emit({ stage: 'beautifying', message: 'Cleaning up HTML…', progress: 90 });
    const cleanedHtml = htmlBeautify(doc.body.innerHTML, {
      indent_size: 2,
      wrap_line_length: 120,
      end_with_newline: true,
    });

    emit({
      stage: 'complete',
      message: 'Processing complete',
      progress: 100,
      result: cleanedHtml,
      biblePassages,
    });
  }

  // ── Markup processor ──────────────────────────────────────────────────────
  //
  //   **bold text**  →  <blockquote>bold text</blockquote>
  //   $$John 3:16$$  →  <span class="bible-ref" data-ref="John 3:16">John 3:16</span>
  //   John 3:16      →  same (detected via general regex)
  //
  // Before unwrapping, any span whose data-ref is already a JSON object
  // (i.e. it was previously processed and has { ref, text }) is harvested
  // into `existingPassages` so the caller can skip re-fetching those refs.

  private applyMarkup(doc: Document): {
    parsedRefs: ParsedBibleRef[];
    existingPassages: Map<string, BiblePassageRef>;
  } {
    const parsedRefs: ParsedBibleRef[] = [];

    // ── Step 1: harvest already-fetched refs, then unwrap all bible-ref spans ─
    //
    //  data-ref can be either:
    //    • plain text  →  "John 3:16"          (not yet fetched)
    //    • JSON object →  {"ref":"…","text":[…]} (already fetched)
    //
    const existingPassages = new Map<string, BiblePassageRef>();

    for (const span of Array.from(doc.querySelectorAll('span.bible-ref'))) {
      const raw = span.getAttribute('data-ref') ?? '';
      try {
        const obj = JSON.parse(raw) as { ref?: string; text?: string[] };
        if (typeof obj.ref === 'string' && Array.isArray(obj.text) && obj.text.length > 0) {
          existingPassages.set(obj.ref.trim().toLowerCase(), {
            ref:     obj.ref.trim(),
            passage: obj.text,
          });
        }
      } catch { /* plain-text data-ref — not yet fetched, skip */ }

      const parent = span.parentNode;
      if (parent) {
        while (span.firstChild) parent.insertBefore(span.firstChild, span);
        span.remove();
      }
    }

    // ── Step 2: walk text nodes and apply combined pattern ───────────────────
    this.walkTextNodes(doc.body, (textNode) => {
      const text = textNode.nodeValue ?? '';
      if (!text.trim()) return;

      // Quick pre-check before building the full regex
      const hasBold   = text.includes('**');
      const hasDollar = text.includes('$$');
      const re        = this.newCombinedRe();
      if (!hasBold && !hasDollar && !re.test(text)) return;
      re.lastIndex = 0; // reset after test()

      const combined = this.newCombinedRe(); // fresh regex with lastIndex = 0
      const frag = doc.createDocumentFragment();
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = combined.exec(text)) !== null) {
        // Text before this match
        if (match.index > lastIndex) {
          frag.appendChild(doc.createTextNode(text.slice(lastIndex, match.index)));
        }

        const m0 = match[0];

        if (m0.startsWith('**')) {
          // **text** → <blockquote>
          const bq = doc.createElement('blockquote');
          bq.textContent = m0.slice(2, -2);
          frag.appendChild(bq);

        } else if (m0.startsWith('$$')) {
          // $$ref$$ → explicit bible-ref span
          const refText = m0.slice(2, -2).trim();
          this.appendBibleRefSpan(doc, frag, refText, parsedRefs);

        } else {
          // General Bible ref detected by the book-name regex
          this.appendBibleRefSpan(doc, frag, m0.trim(), parsedRefs);
        }

        lastIndex = match.index + m0.length;
      }

      // Remaining tail text
      if (lastIndex < text.length) {
        frag.appendChild(doc.createTextNode(text.slice(lastIndex)));
      }

      textNode.parentNode?.replaceChild(frag, textNode);
    });

    return { parsedRefs, existingPassages };
  }

  /** Create a <span class="bible-ref">, add to fragment, and register the parsed ref. */
  private appendBibleRefSpan(
    doc: Document,
    frag: DocumentFragment,
    refText: string,
    parsedRefs: ParsedBibleRef[],
  ): void {
    const parsed = this.parseBibleRef(refText);
    const span   = doc.createElement('span');
    span.className = 'bible-ref';
    span.setAttribute('data-ref', refText); // replaced with JSON after fetch
    span.textContent = refText;
    frag.appendChild(span);
    if (parsed) {
      parsedRefs.push({ book: parsed.book, chapters: parsed.chapters, displayRef: refText, spanEl: span });
    }
  }

  /** Depth-first text-node walker — skips script/style. */
  private walkTextNodes(node: Node, cb: (t: Text) => void): void {
    if (node.nodeType === Node.TEXT_NODE) {
      cb(node as Text);
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as Element).tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') return;
    }
    // Clone childNodes before iterating — cb may mutate the tree
    for (const child of Array.from(node.childNodes)) {
      this.walkTextNodes(child, cb);
    }
  }

  // ── Bible reference parser ────────────────────────────────────────────────

  private parseBibleRef(text: string): ParsedRefData | null {
    const clean = text.trim();

    // Semicolon-separated segments: "Matthew 7:1-6;8:1-23"
    if (clean.includes(';')) {
      const segments = clean.split(';');
      const first    = this.parseBibleRef(segments[0].trim());
      if (!first) return null;

      for (let i = 1; i < segments.length; i++) {
        const seg = segments[i].trim();
        // Continuation segment like "8:1-23" (no book name)
        if (/^\d+/.test(seg)) {
          const m = seg.match(/^(\d+)(?::(\d+)(?:-(\d+))?)?/);
          if (m) {
            const sv = m[2] ? parseInt(m[2]) : undefined;
            const ev = m[3] ? parseInt(m[3]) : undefined;
            first.chapters.push({
              number: parseInt(m[1]),
              startVerse: sv,
              endVerse: ev,
              singleVerse: !!sv && !ev,
            });
          }
        } else {
          const extra = this.parseBibleRef(seg);
          if (extra) first.chapters.push(...extra.chapters);
        }
      }
      return first;
    }

    // Main pattern:
    //   Group 1: book name (optional leading digit, e.g. "1 John")
    //   Group 2: start chapter
    //   Group 3: start verse (optional)
    //   Group 4: end chapter  (optional cross-chapter, e.g. "22:1-23:10" → "23")
    //   Group 5: end verse    (optional)
    const re = /^(\d?\s?[A-Za-z]+(?:\s[A-Za-z]+)*)\s+(\d+)(?::(\d+))?(?:-(?:(\d+):)?(\d+))?$/;
    const m  = re.exec(clean);
    if (!m) return null;

    const book         = m[1].trim();
    const startChapter = parseInt(m[2]);
    const startVerse   = m[3] ? parseInt(m[3]) : undefined;
    const endChapter   = m[4] ? parseInt(m[4]) : undefined;
    const endVerse     = m[5] ? parseInt(m[5]) : undefined;

    const chapters: BibleChapterRange[] = [];

    if (endChapter && endChapter !== startChapter) {
      // Cross-chapter range — e.g. "2 Sam 22:1-23:10"
      if (startVerse !== undefined) {
        chapters.push({ number: startChapter, startVerse, endVerse: undefined, singleVerse: false });
        for (let c = startChapter + 1; c < endChapter; c++) chapters.push({ number: c });
        chapters.push({ number: endChapter, startVerse: 1, endVerse, singleVerse: false });
      } else {
        // Whole chapters: "2 Sam 22-23"
        for (let c = startChapter; c <= endChapter; c++) chapters.push({ number: c });
      }
    } else {
      // Single chapter
      const singleVerse = startVerse !== undefined && endVerse === undefined;
      chapters.push({ number: startChapter, startVerse, endVerse, singleVerse });
    }

    return { book, chapters };
  }

  // ── Bible passage fetcher ────────────────────────────────────────────────

  private async fetchPassageRef(
    ref: ParsedBibleRef,
    books: BibleBook[],
  ): Promise<BiblePassageRef | null> {
    const book = books.find(
      (b) =>
        b.name.toLowerCase() === ref.book.toLowerCase() ||
        b.abbrev.toLowerCase() === ref.book.toLowerCase(),
    );
    if (!book) return null;

    const allVerses: string[] = [];

    for (const ch of ref.chapters) {
      try {
        const chapterData = await firstValueFrom(
          this.bibleService.getVerses(book.abbrev, ch.number),
        );
        if (!chapterData) continue;

        const start = ch.startVerse !== undefined ? ch.startVerse - 1 : 0;
        const end   = ch.singleVerse && ch.startVerse !== undefined
          ? ch.startVerse            // "Acts 16:6"  → slice(5, 6)
          : ch.endVerse !== undefined
            ? ch.endVerse            // "Acts 16:6-8" → slice(5, 8)
            : chapterData.versesCount; // whole chapter

        allVerses.push(...chapterData.verses.slice(start, end));
      } catch { /* skip chapter on error */ }
    }

    if (!allVerses.length) return null;

    // Stamp the span with JSON so downstream consumers get ref + verse text together
    ref.spanEl.setAttribute(
      'data-ref',
      JSON.stringify({ ref: ref.displayRef, text: allVerses }),
    );

    return { ref: ref.displayRef, passage: allVerses };
  }

  // ── HTML conversion ───────────────────────────────────────────────────────

  private async convertToHtml(file: File, buffer: ArrayBuffer): Promise<string> {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'docx' || ext === 'doc') return this.docxToHtml(buffer);
    if (ext === 'pdf')                    return this.pdfToHtml(buffer);
    throw new Error(`Unsupported file type: .${ext}`);
  }

  private async docxToHtml(buffer: ArrayBuffer): Promise<string> {
    const mammoth = await import('mammoth');
    const result  = await mammoth.convertToHtml(
      { arrayBuffer: buffer },
      {
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h4:fresh",
          "p[style-name='Quote']     => blockquote:fresh",
          "r[style-name='Strong']    => strong",
        ],
      },
    );
    return result.value;
  }

  private async pdfToHtml(buffer: ArrayBuffer): Promise<string> {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

    const pdf  = await pdfjsLib.getDocument({ data: buffer }).promise;
    let   html = '';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page    = await pdf.getPage(pageNum);
      const content = await page.getTextContent();

      let para  = '';
      let prevY: number | null = null;

      for (const item of content.items as { str: string; transform: number[] }[]) {
        const y = item.transform[5];
        if (prevY !== null && Math.abs(y - prevY) > 5 && para.trim()) {
          html += `<p>${this.escapeHtml(para.trim())}</p>\n`;
          para  = '';
        }
        para  += (para ? ' ' : '') + item.str;
        prevY  = y;
      }
      if (para.trim()) html += `<p>${this.escapeHtml(para.trim())}</p>\n`;
    }

    return html;
  }

  // ── HTML normalisation ───────────────────────────────────────────────────

  private parseAndNormalize(htmlStr: string): Document {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(htmlStr, 'text/html');
    this.normalizeNode(doc.body);
    return doc;
  }

  private normalizeNode(node: Node): void {
    for (const child of Array.from(node.childNodes)) this.normalizeNode(child);

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;

    // Collapse identical single-child wrapper (removes pointless deep nesting)
    if (
      el.childNodes.length === 1 &&
      el.childNodes[0].nodeType === Node.ELEMENT_NODE &&
      (el.childNodes[0] as Element).tagName === el.tagName
    ) {
      const inner = el.childNodes[0] as Element;
      while (inner.firstChild) el.insertBefore(inner.firstChild, inner);
      inner.remove();
    }

    // Unwrap attribute-less <span> (mammoth wraps text in no-attribute spans)
    if (el.tagName === 'SPAN' && !el.className && !el.getAttribute('style') && !el.id) {
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        el.remove();
        return;
      }
    }

    // Remove empty block elements (preserve <img> and <br>)
    const blocks = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE'];
    if (
      blocks.includes(el.tagName) &&
      !el.textContent?.trim() &&
      el.querySelectorAll('img, br').length === 0
    ) {
      el.remove();
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  private base64ToFile(dataUrl: string, filename: string): File {
    const [header, data] = dataUrl.split(',');
    const mime  = header.match(/data:([^;]+)/)?.[1] ?? 'image/png';
    const ext   = mime.split('/')[1] ?? 'png';
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    return new File([bytes], `${filename}.${ext}`, { type: mime });
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
