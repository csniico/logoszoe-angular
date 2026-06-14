import {
  Component, inject, signal, computed,
  input, output,
  ViewChild, ElementRef,
  HostListener,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService }   from '../../core/services/auth.service';
import { SearchService } from '../../core/services/search.service';

// ── Search config ─────────────────────────────────────────────────────────────

interface SearchItem {
  _id: string;
  title?: string;
  name?: string;
}

interface ScopeGroup {
  scope:    string;
  label:    string;
  iconPath: string;
  items:    SearchItem[];
  total:    number;
  routeFn:  (id: string) => string;
}

const SEARCH_SCOPES = [
  {
    scope:    'articles',
    label:    'Articles',
    iconPath: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8L14 2zM14 2v6h6M16 13H8M16 17H8M10 9H8',
    routeFn:  (id: string) => `/articles/${id}`,
  },
  {
    scope:    'devotionals',
    label:    'Devotionals',
    iconPath: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
    routeFn:  (id: string) => `/devotionals/${id}`,
  },
  {
    scope:    'podcasts',
    label:    'Podcasts',
    iconPath: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8',
    routeFn:  (_id: string) => `/podcasts`,
  },
  {
    scope:    'videos',
    label:    'Videos',
    iconPath: 'M15 10l4.553-2.277A1 1 0 0 1 21 8.68v6.64a1 1 0 0 1-1.447.898L15 14v-4zM3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z',
    routeFn:  (_id: string) => `/videos`,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss',
})
export class TopbarComponent implements OnDestroy {
  private readonly authService   = inject(AuthService);
  private readonly searchService = inject(SearchService);
  private readonly router        = inject(Router);

  @ViewChild('searchWrap')  searchWrapRef!:  ElementRef;
  @ViewChild('profileWrap') profileWrapRef!: ElementRef;

  // ── Shell communication ────────────────────────────────────────────────────
  readonly mobileMenuOpen = input<boolean>(false);
  readonly sidebarToggle  = output<void>();
  readonly mobileToggle   = output<void>();

  // ── Auth ───────────────────────────────────────────────────────────────────
  readonly admin = this.authService.currentAdmin;

  readonly adminInitial = computed(() =>
    (this.admin()?.name?.[0] ?? '?').toUpperCase(),
  );

  // ── Search state ──────────────────────────────────────────────────────────
  readonly query      = signal('');
  readonly searching  = signal(false);
  readonly showDrop   = signal(false);
  readonly results    = signal<ScopeGroup[]>([]);

  // ── Profile dropdown ──────────────────────────────────────────────────────
  readonly profileOpen = signal(false);

  // ── Debounce handle ───────────────────────────────────────────────────────
  private searchTimer?: ReturnType<typeof setTimeout>;
  private searchId = 0;

  // ── Outside-click handler ─────────────────────────────────────────────────
  @HostListener('document:mousedown', ['$event'])
  onDocMousedown(e: MouseEvent): void {
    if (this.searchWrapRef  && !this.searchWrapRef.nativeElement.contains(e.target as Node)) {
      this.showDrop.set(false);
    }
    if (this.profileWrapRef && !this.profileWrapRef.nativeElement.contains(e.target as Node)) {
      this.profileOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.showDrop.set(false);
    this.profileOpen.set(false);
  }

  // ── Search ────────────────────────────────────────────────────────────────
  onQueryInput(value: string): void {
    this.query.set(value);
    clearTimeout(this.searchTimer);

    if (!value.trim()) {
      this.results.set([]);
      this.showDrop.set(false);
      this.searching.set(false);
      return;
    }

    this.searching.set(true);
    this.searchTimer = setTimeout(() => this.runSearch(value), 300);
  }

  clearSearch(): void {
    clearTimeout(this.searchTimer);
    this.query.set('');
    this.results.set([]);
    this.showDrop.set(false);
    this.searching.set(false);
  }

  itemTitle(item: SearchItem): string {
    return item.title ?? item.name ?? '-';
  }

  navigateTo(group: ScopeGroup, item: SearchItem): void {
    void this.router.navigate([group.routeFn(item._id)]);
    this.clearSearch();
  }

  // ── Profile ───────────────────────────────────────────────────────────────
  signOut(): void {
    this.profileOpen.set(false);
    this.authService.signOut();
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────
  ngOnDestroy(): void {
    clearTimeout(this.searchTimer);
  }

  // ── Private ───────────────────────────────────────────────────────────────
  private runSearch(q: string): void {
    const id = ++this.searchId;

    forkJoin(
      SEARCH_SCOPES.map(s =>
        this.searchService.search<SearchItem>(q, s.scope, 1, 4).pipe(
          catchError(() => of({
            data: [] as SearchItem[],
            total: 0, page: 1, limit: 4, totalPages: 0, scope: s.scope,
          })),
        ),
      ),
    ).subscribe(responses => {
      if (id !== this.searchId) return; // discard stale responses

      const groups: ScopeGroup[] = responses
        .map((r, i) => ({
          scope:    SEARCH_SCOPES[i].scope,
          label:    SEARCH_SCOPES[i].label,
          iconPath: SEARCH_SCOPES[i].iconPath,
          routeFn:  SEARCH_SCOPES[i].routeFn,
          items:    r.data,
          total:    r.total,
        }))
        .filter(g => g.items.length > 0);

      this.results.set(groups);
      this.showDrop.set(true);
      this.searching.set(false);
    });
  }
}
