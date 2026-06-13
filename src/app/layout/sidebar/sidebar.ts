import { Component, input, output, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { CategoryService } from '../../core/services/category.service';
import { VideoService } from '../../core/services/video.service';
import { PODCAST_CATEGORIES } from '../../core/models/podcast.model';

export interface SubNavItem {
  label: string;
  path: string;
  queryParams?: Record<string, string>;
  color?: string;
}

export interface NavItem {
  label: string;
  path: string;
  icon: string;
  expandable?: boolean;
  sectionKey?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class SidebarComponent implements OnInit {
  private readonly categoryService = inject(CategoryService);
  private readonly videoService    = inject(VideoService);
  private readonly router          = inject(Router);

  readonly collapsed   = input<boolean>(false);
  readonly closeMobile = output<void>();

  // Sub-items for expandable sections
  articleSubItems = signal<SubNavItem[]>([]);
  podcastSubItems = signal<SubNavItem[]>(
    PODCAST_CATEGORIES.map(c => ({
      label: c.label,
      path: '/podcasts',
      queryParams: { category: c.value },
    })),
  );
  videoSubItems = signal<SubNavItem[]>([]);

  // Which sections are currently expanded
  expandedSections = signal<Set<string>>(new Set<string>());

  // Reactive current URL for sub-item active detection
  currentUrl = signal<string>('');

  readonly navGroups: NavGroup[] = [
    {
      label: 'Analytics',
      items: [
        { label: 'Dashboard', path: '/dashboard', icon: 'M18 20V10M12 20V4M6 20v-6' },
      ],
    },
    {
      label: 'Content',
      items: [
        {
          label: 'Courses',
          path: '/courses',
          icon: 'M22 10v6M2 10l10-5 10 5-10 5-10-5zM6 12v5c3 3 9 3 12 0v-5',
        },
        {
          label: 'Course Videos',
          path: '/course-videos',
          icon: 'M15 10l4.553-2.277A1 1 0 0 1 21 8.68v6.64a1 1 0 0 1-1.447.898L15 14v-4zM3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8zM12 12h.01',
        },
        {
          label: 'Submissions',
          path: '/submissions',
          icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
        },
        {
          label: 'Articles',
          path: '/articles',
          icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8L14 2zM14 2v6h6M16 13H8M16 17H8M10 9H8',
          expandable: true,
          sectionKey: 'articles',
        },
        {
          label: 'Devotionals',
          path: '/devotionals',
          icon: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
        },
        {
          label: 'Bible',
          path: '/bible',
          icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z',
        },
        {
          label: 'Podcasts',
          path: '/podcasts',
          icon: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8',
          expandable: true,
          sectionKey: 'podcasts',
        },
        {
          label: 'Categories',
          path: '/categories',
          icon: 'M4 6h16M4 12h8m-8 6h16',
        },
      ],
    },
    {
      label: 'Community',
      items: [
        {
          label: 'Posts',
          path: '/community',
          icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
        },
        {
          label: 'Prayer',
          path: '/prayer',
          icon: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
        },
      ],
    },
    {
      label: 'Commerce',
      items: [
        {
          label: 'Shop',
          path: '/shop',
          icon: 'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
        },
        {
          label: 'Donations',
          path: '/donations',
          icon: 'M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
        },
      ],
    },
    {
      label: 'System',
      items: [
        {
          label: 'Users',
          path: '/users',
          icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
        },
        {
          label: 'Videos',
          path: '/videos',
          icon: 'M15 10l4.553-2.277A1 1 0 0 1 21 8.68v6.64a1 1 0 0 1-1.447.898L15 14v-4zM3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z',
          expandable: true,
          sectionKey: 'videos',
        },
        {
          label: 'Storage',
          path: '/storage',
          icon: 'M22 12H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11zM6 16h.01M10 16h.01',
        },
        {
          label: 'Audit Logs',
          path: '/audit-logs',
          icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9l2 2 4-4',
        },
      ],
    },
  ];

  ngOnInit(): void {
    // Load article categories from API
    this.categoryService.getAll().subscribe(({ categories }) => {
      this.articleSubItems.set(
        categories.map(c => ({
          label: c.name,
          path: '/articles',
          queryParams: { category: c.slug },
          color: c.color,
        })),
      );
    });

    // Load unique video categories from API
    this.videoService.getAll().subscribe(videos => {
      const seen = new Set<string>();
      const items: SubNavItem[] = [];
      for (const v of videos) {
        if (v.category && !seen.has(v.category)) {
          seen.add(v.category);
          items.push({
            label: v.category,
            path: '/videos',
            queryParams: { category: v.category },
          });
        }
      }
      this.videoSubItems.set(items);
    });

    // Seed current URL and auto-expand matching section
    this.currentUrl.set(this.router.url);
    this.autoExpandForUrl(this.router.url);

    // Keep URL signal up-to-date and auto-expand on navigation
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(e => {
        const url = (e as NavigationEnd).urlAfterRedirects;
        this.currentUrl.set(url);
        this.autoExpandForUrl(url);
      });
  }

  // Returns the sub-item list for a given section key
  getSubItems(sectionKey: string): SubNavItem[] {
    switch (sectionKey) {
      case 'articles': return this.articleSubItems();
      case 'podcasts': return this.podcastSubItems();
      case 'videos':   return this.videoSubItems();
      default:         return [];
    }
  }

  // Toggle expand/collapse of a section
  toggleSection(key: string): void {
    this.expandedSections.update(set => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  isSectionExpanded(key: string): boolean {
    return this.expandedSections().has(key);
  }

  // Check whether a sub-item is the active route (path + query param match)
  isSubItemActive(sub: SubNavItem): boolean {
    const url = this.currentUrl();
    const [pathname, search] = url.split('?');
    if (pathname !== sub.path) return false;
    if (!sub.queryParams) return true;
    const params = new URLSearchParams(search ?? '');
    return Object.entries(sub.queryParams).every(([k, v]) => params.get(k) === v);
  }

  private autoExpandForUrl(url: string): void {
    const map: [string, string][] = [
      ['articles', '/articles'],
      ['podcasts', '/podcasts'],
      ['videos',   '/videos'],
    ];
    this.expandedSections.update(set => {
      const next = new Set(set);
      for (const [key, prefix] of map) {
        if (url.startsWith(prefix)) next.add(key);
      }
      return next;
    });
  }

  onNavClick(): void {
    this.closeMobile.emit();
  }
}
