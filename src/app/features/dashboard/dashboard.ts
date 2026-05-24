import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnalyticsService } from '../../core/services/analytics.service';
import { AnalyticsOverview, UserGrowthPoint } from '../../core/models/analytics.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent implements OnInit {
  private readonly analyticsService = inject(AnalyticsService);

  readonly data    = signal<AnalyticsOverview | null>(null);
  readonly loading = signal(true);
  readonly error   = signal<string | null>(null);

  // Which top-content tab is active
  readonly activeTab = signal<'articles' | 'devotionals' | 'podcasts'>('articles');

  ngOnInit(): void {
    this.analyticsService.getOverview().subscribe({
      next:  (d) => { this.data.set(d);  this.loading.set(false); },
      error: ()  => { this.error.set('Failed to load analytics.'); this.loading.set(false); },
    });
  }

  // Total content pieces across all types
  readonly totalContent = computed(() => {
    const c = this.data()?.content;
    if (!c) return 0;
    return c.articles + c.devotionals + c.podcasts + c.videos +
           c.courses  + c.courseVideos + c.posts   + c.prayers;
  });

  // Max hits value for the active top-content list (for bar scaling)
  readonly maxHits = computed(() => {
    const d = this.data();
    if (!d) return 1;
    const tab = this.activeTab();
    const list = tab === 'articles'    ? d.topArticles    :
                 tab === 'devotionals' ? d.topDevotionals : d.topPodcasts;
    return Math.max(1, ...list.map((i) => i.hits));
  });

  // Max engagement score for top posts bar scaling
  readonly maxPostScore = computed(() => {
    const d = this.data();
    if (!d) return 1;
    return Math.max(1, ...d.topPosts.map((p) => p.likeCount + p.shareCount));
  });

  // Fill a 30-day calendar from the sparse userGrowth array
  readonly growthSeries = computed<{ date: string; count: number }[]>(() => {
    const d = this.data();
    if (!d) return [];
    const map = new Map(d.userGrowth.map((p) => [p._id, p.count]));
    const series: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      const key = dt.toISOString().slice(0, 10);
      series.push({ date: key, count: map.get(key) ?? 0 });
    }
    return series;
  });

  readonly maxGrowth = computed(() =>
    Math.max(1, ...this.growthSeries().map((s) => s.count)),
  );

  barPct(val: number, max: number): string {
    return `${Math.round((val / max) * 100)}%`;
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  truncate(text: string, max = 80): string {
    return text.length <= max ? text : text.slice(0, max).trimEnd() + '…';
  }

  devotionalLabel(d: { day: number; month: number; year: number; title: string }): string {
    return `${d.day}/${d.month}/${d.year} — ${d.title}`;
  }

  readonly contentItems = computed(() => {
    const c = this.data()?.content;
    if (!c) return [];
    return [
      { label: 'Articles',      count: c.articles,     color: '#6366f1' },
      { label: 'Devotionals',   count: c.devotionals,  color: '#0ea5e9' },
      { label: 'Podcasts',      count: c.podcasts,     color: '#f59e0b' },
      { label: 'Videos',        count: c.videos,       color: '#ec4899' },
      { label: 'Courses',       count: c.courses,      color: '#10b981' },
      { label: 'Course Videos', count: c.courseVideos, color: '#8b5cf6' },
      { label: 'Posts',         count: c.posts,        color: '#14b8a6' },
      { label: 'Prayers',       count: c.prayers,      color: '#f97316' },
    ];
  });
}
