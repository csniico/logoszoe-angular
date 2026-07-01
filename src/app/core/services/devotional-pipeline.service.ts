import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { PipelineProgress } from '../models/pipeline.model';
import { ExtractedDevotional } from '../models/devotional.model';
import { BibleService } from './bible.service';
import { BibleBook, BiblePassageRef } from '../models/bible.model';

// ── AST types ─────────────────────────────────────────────────────────────────

type AstNode =
  | { type: 'p';          children: AstNode[] }
  | { type: 'blockquote'; children: AstNode[] }
  | { type: 'ol' | 'ul'; items: AstNode[][] }
  | { type: 'bold';       children: AstNode[] }
  | { type: 'italic';     children: AstNode[] }
  | { type: 'anchor';     dataAttrs: Record<string, string>; children: AstNode[] }
  | { type: 'image';      src: string; alt: string }
  | { type: 'br' }
  | { type: 'text';       value: string };

// ── Section key types ─────────────────────────────────────────────────────────

type SectionKey =
  | 'themeHeader'
  | 'themeScripture'
  | 'prepQuestions'
  | 'furtherReading'
  | 'meditateQuestions'
  | 'prayer'
  | 'oneYearPlan';

interface LabelEntry {
  key: SectionKey;
  test: RegExp;
  inlineOK?: true;
}

interface Boundary {
  idx: number;
  key: SectionKey;
  inline: boolean;
  entry: LabelEntry;
}

interface Sections {
  themeHeader?: AstNode[];
  themeScripture?: AstNode[];
  prepQuestions?: AstNode[][];
  furtherReading?: AstNode[];
  meditateQuestions?: AstNode[][];
  prayer?: AstNode[];
  oneYearPlan?: AstNode[];
  content: AstNode[];
}

// Sort longest-source-first so "theme scripture" beats "theme"
const SORTED_LABELS: LabelEntry[] = ([
  { key: 'themeScripture',    test: /^theme\s+scripture\s*[:\-–—]/i,              inlineOK: true  },
  { key: 'themeScripture',    test: /^theme\s+scripture\s*[:.?]*$/i },
  { key: 'themeHeader',       test: /^theme\s*[:\-–—]/i,                          inlineOK: true  },
  { key: 'themeHeader',       test: /^theme$/i },
  { key: 'prepQuestions',     test: /^preparatory\s+questions?\s*[:.?]*$/i },
  { key: 'furtherReading',    test: /^further\s+reading\s*[:\-–—]/i,              inlineOK: true  },
  { key: 'furtherReading',    test: /^further\s+reading\s*[:.?]*$/i },
  { key: 'meditateQuestions', test: /^questions?\s+to\s+help\s+you\s+(?:meditate|reflect)\b/i },
  { key: 'prayer',            test: /^prayer\s*[:.?]*$/i },
  { key: 'oneYearPlan',       test: /^(?:one[-\s]+year|1[-\s]+year).*bible.*plan\s*[:.?]*$/i },
  { key: 'oneYearPlan',       test: /^year\s+bible\s+reading\s+plan\s*[:.?]*$/i },
] as LabelEntry[]).sort((a, b) => b.test.source.length - a.test.source.length);

// ── Helper: extract text from a node ─────────────────────────────────────────

function nodeText(node: AstNode): string {
  switch (node.type) {
    case 'text':      return node.value;
    case 'br':        return ' ';
    case 'image':     return '';
    case 'ol':
    case 'ul':        return node.items.map(item => item.map(nodeText).join('')).join(' ');
    case 'p':
    case 'blockquote':
    case 'bold':
    case 'italic':    return node.children.map(nodeText).join('');
    case 'anchor':    return node.children.map(nodeText).join('');
  }
}

function blockText(node: AstNode): string {
  return nodeText(node).replace(/\s+/g, ' ').trim();
}

// ── Stage 1: preClean ─────────────────────────────────────────────────────────

function preClean(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const dateRe   = /^(?:\w+day,?\s+)?\d{1,2}(?:st|nd|rd|th)?\s+\w+\s+\d{4}$/i;
  const authorRe = /^by[\s:]/i;

  const children = Array.from(doc.body.children);
  for (let i = 0; i < Math.min(3, children.length); i++) {
    const el = children[i];
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (dateRe.test(text)) {
      el.remove();
    } else if (authorRe.test(text) && text.length < 120) {
      el.remove();
    } else {
      break;
    }
  }
  return doc.body.innerHTML;
}

// ── Stage 2: parse ────────────────────────────────────────────────────────────

function walkDom(el: Element | Node, images: string[]): AstNode | AstNode[] | null {
  if (el.nodeType === Node.TEXT_NODE) {
    const val = (el as Text).nodeValue ?? '';
    return { type: 'text', value: val };
  }
  if (el.nodeType !== Node.ELEMENT_NODE) return null;

  const element = el as Element;
  const tag = element.tagName.toLowerCase();

  if (tag === 'table' || tag === 'script' || tag === 'style') return null;

  const mapChildren = (): AstNode[] => {
    return Array.from(element.childNodes)
      .map(c => walkDom(c, images))
      .flatMap(r => r === null ? [] : Array.isArray(r) ? r : [r]);
  };

  if (tag === 'p') {
    const children = mapChildren();
    if (children.length === 1 && children[0].type === 'p') return children[0];
    return { type: 'p', children };
  }

  if (tag === 'blockquote') {
    return { type: 'blockquote', children: mapChildren() };
  }

  if (tag === 'ol' || tag === 'ul') {
    const liEls = Array.from(element.querySelectorAll(':scope > li'));
    const items: AstNode[][] = liEls.map(li => {
      return Array.from(li.childNodes)
        .map(c => walkDom(c, images))
        .flatMap(r => r === null ? [] : Array.isArray(r) ? r : [r]);
    });
    return { type: tag as 'ol' | 'ul', items };
  }

  if (tag === 'strong' || tag === 'b') {
    return { type: 'bold', children: mapChildren() };
  }

  if (tag === 'em' || tag === 'i') {
    return { type: 'italic', children: mapChildren() };
  }

  if (tag === 'a') {
    const dataAttrs: Record<string, string> = {};
    for (const attr of Array.from(element.attributes)) {
      if (attr.name.startsWith('data-')) dataAttrs[attr.name] = attr.value;
    }
    return { type: 'anchor', dataAttrs, children: mapChildren() };
  }

  if (tag === 'img') {
    const src = element.getAttribute('src') ?? '';
    const alt = element.getAttribute('alt') ?? '';
    if (src) images.push(src);
    return { type: 'image', src, alt };
  }

  if (tag === 'br') return { type: 'br' };

  if (/^h[1-6]$/.test(tag)) {
    return { type: 'p', children: [{ type: 'bold', children: mapChildren() }] };
  }

  return mapChildren();
}

function promoteBlocks(nodes: AstNode[]): AstNode[] {
  const result: AstNode[] = [];
  for (const node of nodes) {
    if (node.type === 'p') {
      const blocks: AstNode[] = [];
      const inlines: AstNode[] = [];
      for (const child of node.children) {
        if (child.type === 'p' || child.type === 'blockquote' || child.type === 'ol' || child.type === 'ul') {
          if (inlines.length) { blocks.push({ type: 'p', children: [...inlines] }); inlines.length = 0; }
          blocks.push(child);
        } else {
          inlines.push(child);
        }
      }
      if (inlines.length) blocks.push({ type: 'p', children: [...inlines] });
      if (blocks.length > 1 || (blocks.length === 1 && blocks[0].type !== 'p')) {
        result.push(...blocks);
      } else {
        result.push(node);
      }
    } else {
      result.push(node);
    }
  }
  return result;
}

function dropEmpty(nodes: AstNode[]): AstNode[] {
  return nodes.filter(n => {
    if (n.type === 'p' || n.type === 'blockquote') {
      return nodeText(n).replace(/\s+/g, '').length > 0;
    }
    return true;
  });
}

function parse(html: string): { ast: AstNode[]; images: string[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="r">${html}</div>`, 'text/html');
  const root = doc.getElementById('r');
  if (!root) return { ast: [], images: [] };

  const images: string[] = [];
  const raw: AstNode[] = Array.from(root.childNodes)
    .map(c => walkDom(c, images))
    .flatMap(r => r === null ? [] : Array.isArray(r) ? r : [r]);

  const promoted = promoteBlocks(raw);
  const clean = dropEmpty(promoted);
  return { ast: clean, images };
}

// ── Stage 3: sectionize ───────────────────────────────────────────────────────

function stripInlineLabel(block: AstNode, entry: LabelEntry): AstNode | null {
  if (block.type !== 'p' && block.type !== 'blockquote') return null;
  const fullText = blockText(block);
  const match = entry.test.exec(fullText);
  if (!match) return null;
  const labelLen = match[0].length;

  const children = block.children;
  let accumulated = 0;
  const newChildren: AstNode[] = [];
  let found = false;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const text = nodeText(child);
    if (found) {
      newChildren.push(child);
      continue;
    }
    if (accumulated + text.length <= labelLen) {
      accumulated += text.length;
      continue;
    }
    found = true;
    const offset = labelLen - accumulated;
    if (child.type === 'text') {
      const suffix = child.value.slice(offset).replace(/^[\s:–—\-–]+/, '');
      if (suffix.trim()) newChildren.push({ type: 'text', value: suffix });
    } else {
      newChildren.push(child);
    }
    accumulated += text.length;
  }

  const stripped = newChildren.filter(c => nodeText(c).trim().length > 0);
  if (!stripped.length) return null;

  const first = stripped[0];
  if (first.type === 'text') {
    stripped[0] = { type: 'text', value: first.value.replace(/^[\s:–—\-–]+/, '') };
  }

  return { type: 'p', children: stripped };
}

function extractQuestions(blocks: AstNode[]): { questions: AstNode[][]; remainder: AstNode[] } {
  if (!blocks.length) return { questions: [], remainder: [] };

  if (blocks[0].type === 'ol' || blocks[0].type === 'ul') {
    return { questions: blocks[0].items, remainder: blocks.slice(1) };
  }

  const numberedRe = /^\s*\(?\s*\d+\s*[\.\)]\s*/;
  const questions: AstNode[][] = [];
  let i = 0;
  for (; i < blocks.length; i++) {
    const txt = blockText(blocks[i]);
    if (!numberedRe.test(txt)) break;
    questions.push([blocks[i]]);
  }
  if (questions.length > 0) {
    return { questions, remainder: blocks.slice(i) };
  }

  const qQuestions: AstNode[][] = [];
  let j = 0;
  for (; j < blocks.length; j++) {
    const txt = blockText(blocks[j]);
    if (!txt.endsWith('?')) break;
    qQuestions.push([blocks[j]]);
  }
  return { questions: qQuestions, remainder: blocks.slice(j) };
}

function sectionize(ast: AstNode[]): Sections {
  const boundaries: Boundary[] = [];

  for (let idx = 0; idx < ast.length; idx++) {
    const node = ast[idx];
    const text = blockText(node);
    for (const entry of SORTED_LABELS) {
      const match = entry.test.exec(text);
      if (match) {
        const inline = entry.inlineOK === true && match[0].length < text.length;
        boundaries.push({ idx, key: entry.key, inline, entry });
        break;
      }
    }
  }

  const consumed    = new Set<number>();
  const found       = new Map<SectionKey, AstNode[]>();
  const foundQuestions = new Map<'prepQuestions' | 'meditateQuestions', AstNode[][]>();
  // Remainder nodes from question sections (body text after the questions list)
  // tracked by reference so we can restore document order below.
  const remainderSet = new Set<AstNode>();

  for (let bi = 0; bi < boundaries.length; bi++) {
    const { idx, key, inline, entry } = boundaries[bi];
    if (found.has(key) || foundQuestions.has(key as 'prepQuestions' | 'meditateQuestions')) continue;

    const nextIdx = bi + 1 < boundaries.length ? boundaries[bi + 1].idx : ast.length;

    let valueBlocks: AstNode[];

    if (inline) {
      const stripped = stripInlineLabel(ast[idx], entry);
      valueBlocks = [
        ...(stripped ? [stripped] : []),
        ...ast.slice(idx + 1, nextIdx),
      ];
    } else {
      valueBlocks = ast.slice(idx + 1, nextIdx);
    }

    for (let k = idx; k < nextIdx; k++) consumed.add(k);

    if (key === 'prepQuestions' || key === 'meditateQuestions') {
      const { questions, remainder } = extractQuestions(valueBlocks);
      foundQuestions.set(key, questions);
      // Remainder = body paragraphs after the questions list — rescue them for content.
      for (const node of remainder) remainderSet.add(node);
    } else {
      found.set(key, valueBlocks);
    }
  }

  // Build content: unconsumed AST nodes + remainder nodes rescued from question
  // sections. Re-filter through the original AST to preserve document order
  // (remainder nodes are the same object references as in ast).
  const contentSet = new Set<AstNode>();
  ast.forEach((node, i) => { if (!consumed.has(i)) contentSet.add(node); });
  remainderSet.forEach(node => contentSet.add(node));

  const content = ast
    .filter(node => contentSet.has(node))
    .filter(n   => !/^theme\s*[:\-–—]/i.test(blockText(n)));

  return {
    themeHeader:       found.get('themeHeader'),
    themeScripture:    found.get('themeScripture'),
    prepQuestions:     foundQuestions.get('prepQuestions'),
    furtherReading:    found.get('furtherReading'),
    meditateQuestions: foundQuestions.get('meditateQuestions'),
    prayer:            found.get('prayer'),
    oneYearPlan:       found.get('oneYearPlan'),
    content,
  };
}

// ── Stage 4: renderNodes ──────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderInline(node: AstNode): string {
  switch (node.type) {
    case 'text':      return escapeHtml(node.value);
    case 'br':        return '<br/>';
    case 'bold':      return `<strong>${node.children.map(renderInline).join('')}</strong>`;
    case 'italic':    return `<em>${node.children.map(renderInline).join('')}</em>`;
    case 'anchor': {
      const attrs = Object.entries(node.dataAttrs).map(([k, v]) => `${k}="${escapeHtml(v)}"`).join(' ');
      return `<a${attrs ? ' ' + attrs : ''}>${node.children.map(renderInline).join('')}</a>`;
    }
    case 'image':     return `<img src="${escapeHtml(node.src)}" alt="${escapeHtml(node.alt)}"/>`;
    case 'p':         return node.children.map(renderInline).join('');
    case 'blockquote': return node.children.map(renderInline).join('');
    case 'ol':
    case 'ul':
      return node.items.map(item => `<li>${item.map(renderInline).join('')}</li>`).join('');
  }
}

function isBlock(node: AstNode): boolean {
  return node.type === 'p' || node.type === 'blockquote' || node.type === 'ol' || node.type === 'ul';
}

function renderNodes(nodes: AstNode[]): string {
  if (!nodes.length) return '';
  const parts: string[] = [];
  let inlineRun: AstNode[] = [];

  const flushInline = () => {
    if (!inlineRun.length) return;
    const inner = inlineRun.map(renderInline).join('');
    if (inner.trim()) parts.push(`<p>${inner}</p>`);
    inlineRun = [];
  };

  for (const node of nodes) {
    if (isBlock(node)) {
      flushInline();
      switch (node.type) {
        case 'p':
          parts.push(`<p>${node.children.map(renderInline).join('')}</p>`);
          break;
        case 'blockquote':
          parts.push(`<blockquote>${node.children.map(renderInline).join('')}</blockquote>`);
          break;
        case 'ol':
          parts.push(`<ol>${node.items.map(item => `<li>${item.map(renderInline).join('')}</li>`).join('')}</ol>`);
          break;
        case 'ul':
          parts.push(`<ul>${node.items.map(item => `<li>${item.map(renderInline).join('')}</li>`).join('')}</ul>`);
          break;
      }
    } else {
      inlineRun.push(node);
    }
  }
  flushInline();

  return parts.join('\n');
}

// ── Stage 5: normalizeDoc ─────────────────────────────────────────────────────

function normalizeDoc(sections: Sections, images: string[]): Omit<ExtractedDevotional, 'biblePassages'> {
  return {
    title:                      sections.themeHeader?.[0] ? blockText(sections.themeHeader[0]) : '',
    author:                     '',
    themeScripture:             renderNodes(sections.themeScripture ?? []),
    preparatoryQuestions:       (sections.prepQuestions ?? []).map(q => renderNodes(q)).filter(Boolean),
    content:                    renderNodes(sections.content),
    furtherReading:             renderNodes(sections.furtherReading ?? []),
    questionsToHelpYouMeditate: (sections.meditateQuestions ?? []).map(q => renderNodes(q)).filter(Boolean),
    prayer:                     renderNodes(sections.prayer ?? []),
    oneYearBiblePlan:           renderNodes(sections.oneYearPlan ?? []),
    listOfImageAssets:          images,
  };
}

// ── Bible book names (mirrors DocumentPipelineService) ────────────────────────

const BIBLE_BOOK_NAMES: readonly string[] = ([
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
  '1 Chron', '2 Chron', '1 Thess', '2 Thess', '1 Cor', '2 Cor',
  '1 Chr',   '2 Chr',   '1 Tim',   '2 Tim',   '1 Sam', '2 Sam',
  '1 Kgs',   '2 Kgs',   '1 Pet',   '2 Pet',   '1 Jn',  '2 Jn', '3 Jn',
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

// ── Bible ref internal types ──────────────────────────────────────────────────

interface BibleChapterRange {
  number: number;
  startVerse?: number;
  endVerse?: number;
  singleVerse?: boolean;
}

interface ParsedRefData {
  book: string;
  chapters: BibleChapterRange[];
}

interface ParsedBibleRef extends ParsedRefData {
  displayRef: string;
  spanEl: Element;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class DevotionalPipelineService {

  private readonly bibleService = inject(BibleService);

  // ── Regex cache ──────────────────────────────────────────────────────────────

  private _bibleRefSource = '';

  private getBibleRefSource(): string {
    if (!this._bibleRefSource) {
      const bookAlt = BIBLE_BOOK_NAMES
        .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
        .join('|');
      this._bibleRefSource =
        `(?<!\\w)(?:${bookAlt})\\.?\\s+` +
        `\\d{1,3}(?::\\d{1,3}(?:[-\\u2013](?:\\d{1,3}:)?\\d{1,3})?)?` +
        `(?!\\w)`;
    }
    return this._bibleRefSource;
  }

  /**
   * Combined regex matching (priority order):
   *   1. **bold text**  → blockquote
   *   2. $$BibleRef$$   → explicit bible-ref span
   *   3. Bare BibleRef  → implicit bible-ref span
   */
  private newCombinedRe(): RegExp {
    return new RegExp(
      `\\*\\*.+?\\*\\*|\\$\\$.+?\\$\\$|${this.getBibleRefSource()}`,
      'gis',
    );
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  process(file: File): Observable<PipelineProgress> {
    return new Observable<PipelineProgress>((subscriber) => {
      this.run(file, (p) => subscriber.next(p))
        .then(() => subscriber.complete())
        .catch((err: unknown) => {
          // Log the real error — this pipeline runs client-side, so there are
          // no server logs, and the message must carry the detail to the UI.
          console.error('[DevotionalPipeline] process failed:', err);
          const detail = err instanceof Error ? err.message : String(err);
          subscriber.next({
            stage: 'error',
            message: `Pipeline failed: ${detail}`,
          });
          subscriber.complete();
        });
    });
  }

  // ── Pipeline orchestrator ────────────────────────────────────────────────────

  private async run(file: File, emit: (p: PipelineProgress) => void): Promise<void> {
    emit({ stage: 'reading',             message: 'Reading document…',         progress: 5  });
    const buffer = await file.arrayBuffer();

    emit({ stage: 'converting',          message: 'Converting to HTML…',       progress: 18 });
    // mammoth's CommonJS deps expect a Node-style `global`. The dev server
    // defines it but the optimized production build does not, which makes the
    // dynamic import throw "global is not defined" only on the deployed app.
    (globalThis as unknown as { global?: unknown }).global ??= globalThis;
    // mammoth is `export = mammoth`; the optimized prod build exposes it only
    // on `.default`, so `convertToHtml` is undefined at the top level there.
    const mammothImport = await import('mammoth');
    const mammoth = mammothImport.default ?? mammothImport;
    const { value: rawHtml } = await mammoth.convertToHtml({ arrayBuffer: buffer }, {
      styleMap: [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Quote']     => blockquote:fresh",
        "r[style-name='Strong']    => strong",
      ],
    });

    emit({ stage: 'normalizing',         message: 'Cleaning preamble…',        progress: 32 });
    const cleanHtml = preClean(rawHtml);

    emit({ stage: 'extracting-sections', message: 'Extracting sections…',      progress: 48 });
    const { ast, images } = parse(cleanHtml);
    const sections = sectionize(ast);

    emit({ stage: 'beautifying',         message: 'Rendering fields…',         progress: 62 });
    const rendered = normalizeDoc(sections, images);

    // ── Stage 6: markup — **…** → blockquote, Bible refs → spans ─────────────
    emit({ stage: 'processing-markup',   message: 'Detecting Bible references…', progress: 72 });

    // Wrap every section in a labelled <div> so we can re-read each one after
    // the markup pass modifies the live DOM.
    const sectionKeys = [
      'content', 'themeScripture', 'furtherReading', 'prayer', 'oneYearBiblePlan',
    ] as const;

    let combinedHtml = sectionKeys
      .map(k => `<div data-section="${k}">${rendered[k] ?? ''}</div>`)
      .join('');

    rendered.preparatoryQuestions.forEach((q, i) => {
      combinedHtml += `<div data-section="prepQ-${i}">${q}</div>`;
    });
    rendered.questionsToHelpYouMeditate.forEach((q, i) => {
      combinedHtml += `<div data-section="medQ-${i}">${q}</div>`;
    });

    const parser = new DOMParser();
    const markupDoc = parser.parseFromString(
      `<!DOCTYPE html><html><body>${combinedHtml}</body></html>`,
      'text/html',
    );

    const { parsedRefs } = this.applyMarkup(markupDoc);

    // ── Stage 7: fetch Bible passages ────────────────────────────────────────
    const biblePassages: BiblePassageRef[] = [];

    if (parsedRefs.length > 0) {
      let books: BibleBook[] = [];
      try { books = await firstValueFrom(this.bibleService.getBooks()); } catch { /* continue */ }

      for (let i = 0; i < parsedRefs.length; i++) {
        const ref = parsedRefs[i];
        emit({
          stage: 'fetching-bible',
          message: `Fetching "${ref.displayRef}" (${i + 1} of ${parsedRefs.length})…`,
          progress: 72 + Math.round(((i + 1) / parsedRefs.length) * 20),
          bibleTask: { current: i + 1, total: parsedRefs.length },
        });
        try {
          const fetched = await this.fetchPassageRef(ref, books);
          if (fetched) biblePassages.push(fetched);
        } catch { /* skip this ref */ }
      }
    }

    // Re-read each section's HTML from the now-processed document
    const getSection = (key: string): string =>
      markupDoc.querySelector(`[data-section="${key}"]`)?.innerHTML ?? '';

    const extracted: ExtractedDevotional = {
      ...rendered,
      content:                    getSection('content'),
      themeScripture:             getSection('themeScripture'),
      furtherReading:             getSection('furtherReading'),
      prayer:                     getSection('prayer'),
      oneYearBiblePlan:           getSection('oneYearBiblePlan'),
      preparatoryQuestions:       rendered.preparatoryQuestions.map((_, i) => getSection(`prepQ-${i}`)),
      questionsToHelpYouMeditate: rendered.questionsToHelpYouMeditate.map((_, i) => getSection(`medQ-${i}`)),
      biblePassages,
    };

    emit({ stage: 'complete', message: 'Document extracted', progress: 100, extracted });
  }

  // ── Markup processor ─────────────────────────────────────────────────────────
  //
  //   **bold text**  →  <blockquote>bold text</blockquote>
  //   $$John 3:16$$  →  <span class="bible-ref" data-ref="John 3:16">John 3:16</span>
  //   John 3:16      →  same (detected via general regex)

  private applyMarkup(doc: Document): { parsedRefs: ParsedBibleRef[] } {
    const parsedRefs: ParsedBibleRef[] = [];

    this.walkTextNodes(doc.body, (textNode) => {
      const text = textNode.nodeValue ?? '';
      if (!text.trim()) return;

      const hasBold   = text.includes('**');
      const hasDollar = text.includes('$$');
      const quickRe   = this.newCombinedRe();
      if (!hasBold && !hasDollar && !quickRe.test(text)) return;

      const combined = this.newCombinedRe(); // fresh instance — lastIndex = 0
      const frag = doc.createDocumentFragment();
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = combined.exec(text)) !== null) {
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
          this.appendBibleRefSpan(doc, frag, m0.slice(2, -2).trim(), parsedRefs);

        } else {
          // Bare Bible reference detected by book-name regex
          this.appendBibleRefSpan(doc, frag, m0.trim(), parsedRefs);
        }

        lastIndex = match.index + m0.length;
      }

      if (lastIndex < text.length) {
        frag.appendChild(doc.createTextNode(text.slice(lastIndex)));
      }

      textNode.parentNode?.replaceChild(frag, textNode);
    });

    return { parsedRefs };
  }

  private appendBibleRefSpan(
    doc: Document,
    frag: DocumentFragment,
    refText: string,
    parsedRefs: ParsedBibleRef[],
  ): void {
    const parsed = this.parseBibleRef(refText);
    const span   = doc.createElement('span');
    span.className = 'bible-ref';
    span.setAttribute('data-ref', refText);
    span.textContent = refText;
    frag.appendChild(span);
    if (parsed) {
      parsedRefs.push({ ...parsed, displayRef: refText, spanEl: span });
    }
  }

  // ── Bible reference parser ────────────────────────────────────────────────────

  private parseBibleRef(text: string): ParsedRefData | null {
    const clean = text.trim();

    if (clean.includes(';')) {
      const segments = clean.split(';');
      const first    = this.parseBibleRef(segments[0].trim());
      if (!first) return null;
      for (let i = 1; i < segments.length; i++) {
        const seg = segments[i].trim();
        if (/^\d+/.test(seg)) {
          const m = seg.match(/^(\d+)(?::(\d+)(?:-(\d+))?)?/);
          if (m) {
            const sv = m[2] ? parseInt(m[2]) : undefined;
            const ev = m[3] ? parseInt(m[3]) : undefined;
            first.chapters.push({ number: parseInt(m[1]), startVerse: sv, endVerse: ev, singleVerse: !!sv && !ev });
          }
        } else {
          const extra = this.parseBibleRef(seg);
          if (extra) first.chapters.push(...extra.chapters);
        }
      }
      return first;
    }

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
      if (startVerse !== undefined) {
        chapters.push({ number: startChapter, startVerse, endVerse: undefined, singleVerse: false });
        for (let c = startChapter + 1; c < endChapter; c++) chapters.push({ number: c });
        chapters.push({ number: endChapter, startVerse: 1, endVerse, singleVerse: false });
      } else {
        for (let c = startChapter; c <= endChapter; c++) chapters.push({ number: c });
      }
    } else {
      const singleVerse = startVerse !== undefined && endVerse === undefined;
      chapters.push({ number: startChapter, startVerse, endVerse, singleVerse });
    }

    return { book, chapters };
  }

  // ── Bible passage fetcher ────────────────────────────────────────────────────

  private async fetchPassageRef(
    ref: ParsedBibleRef,
    books: BibleBook[],
  ): Promise<BiblePassageRef | null> {
    const book = books.find(
      b => b.name.toLowerCase()   === ref.book.toLowerCase() ||
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
          ? ch.startVerse
          : ch.endVerse !== undefined
            ? ch.endVerse
            : chapterData.versesCount;

        allVerses.push(...chapterData.verses.slice(start, end));
      } catch { /* skip chapter on error */ }
    }

    if (!allVerses.length) return null;

    ref.spanEl.setAttribute(
      'data-ref',
      JSON.stringify({ ref: ref.displayRef, text: allVerses }),
    );

    return { ref: ref.displayRef, passage: allVerses };
  }

  // ── Text node walker ─────────────────────────────────────────────────────────

  private walkTextNodes(node: Node, cb: (t: Text) => void): void {
    if (node.nodeType === Node.TEXT_NODE) {
      cb(node as Text);
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as Element).tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') return;
    }
    for (const child of Array.from(node.childNodes)) {
      this.walkTextNodes(child, cb);
    }
  }
}
