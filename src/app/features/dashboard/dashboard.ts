import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgApexchartsModule } from 'ng-apexcharts';
import { AnalyticsService } from '../../core/services/analytics.service';
import { AnalyticsOverview } from '../../core/models/analytics.model';

type ChartSeries = { name: string; data: number[] }[];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
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

  // ── Aggregate stats ────────────────────────────────────────────────────────

  readonly totalContent = computed(() => {
    const c = this.data()?.content;
    if (!c) return 0;
    return c.articles + c.devotionals + c.podcasts + c.videos +
           c.courses  + c.courseVideos + c.posts   + c.prayers;
  });

  // ── Content breakdown chips — Sacred Stillness palette ────────────────────

  readonly contentItems = computed(() => {
    const c = this.data()?.content;
    if (!c) return [];
    return [
      { label: 'Articles',      count: c.articles,     color: '#5A82A8' },
      { label: 'Devotionals',   count: c.devotionals,  color: '#C9A059' },
      { label: 'Podcasts',      count: c.podcasts,     color: '#3a5878' },
      { label: 'Videos',        count: c.videos,       color: '#d4b07a' },
      { label: 'Courses',       count: c.courses,      color: '#2c4460' },
      { label: 'Course Videos', count: c.courseVideos, color: '#8aa8c4' },
      { label: 'Posts',         count: c.posts,        color: '#a08040' },
      { label: 'Prayers',       count: c.prayers,      color: '#7a9ab8' },
    ];
  });

  // ── 30-day user growth series ──────────────────────────────────────────────

  private readonly growthPoints = computed<{ date: string; count: number }[]>(() => {
    const d = this.data();
    if (!d) return [];
    const map = new Map(d.userGrowth.map((p) => [p._id, p.count]));
    const result: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      const key = dt.toISOString().slice(0, 10);
      result.push({ date: key, count: map.get(key) ?? 0 });
    }
    return result;
  });

  // ── Growth chart bindings ──────────────────────────────────────────────────

  readonly growthChartSeries = computed<ChartSeries>(() => [
    { name: 'New Users', data: this.growthPoints().map(s => s.count) },
  ]);

  readonly growthChartXAxis = computed(() => ({
    categories: this.growthPoints().map(s => this.fmtDate(s.date)),
    labels: {
      rotate: -45,
      style: { fontSize: '10px', colors: '#9ca3af', fontFamily: 'Inter,sans-serif' },
    },
    axisBorder: { show: false },
    axisTicks:  { show: false },
  }));

  // Static chart config — height is fixed for growth chart
  readonly growthChartConfig = {
    type: 'bar' as const,
    height: 195,
    toolbar: { show: false },
    fontFamily: 'Inter, sans-serif',
  };

  readonly growthChartColors     = ['#5A82A8'];
  readonly growthChartDataLabels = { enabled: false };
  readonly growthChartPlotOpts   = { bar: { columnWidth: '68%', borderRadius: 2 } };
  readonly growthChartGrid       = { borderColor: '#f3f4f6', strokeDashArray: 3 };
  readonly growthChartYAxis      = {
    labels: { style: { fontSize: '11px', colors: '#9ca3af', fontFamily: 'Inter,sans-serif' } },
  };
  readonly growthChartTooltip    = {
    y: { formatter: (v: number) => `${v} new user${v !== 1 ? 's' : ''}` },
  };

  // ── Top content chart bindings (reactive to tab) ───────────────────────────

  private readonly topItems = computed(() => {
    const d = this.data();
    const tab = this.activeTab();
    if (!d) return [];
    const list = tab === 'articles'    ? d.topArticles
               : tab === 'devotionals' ? d.topDevotionals
               : d.topPodcasts;
    // Reverse so the highest-ranked item appears at the top of a horizontal chart
    return [...list].reverse();
  });

  readonly topContentHasData = computed(() => this.topItems().length > 0);

  readonly topContentSeries = computed<ChartSeries>(() => [{
    name: this.activeTab() === 'podcasts' ? 'Plays' : 'Views',
    data: this.topItems().map(i => i.hits),
  }]);

  readonly topContentXAxis = computed(() => ({
    categories: this.topItems().map(i =>
      this.activeTab() === 'devotionals'
        ? this.truncate(this.devotionalLabel(i as any), 30)
        : this.truncate((i as any).title ?? '', 30),
    ),
    labels: {
      style: { fontSize: '11px', colors: '#6b7280', fontFamily: 'Inter,sans-serif' },
      maxWidth: 175,
    },
    axisBorder: { show: false },
    axisTicks:  { show: false },
  }));

  // Height adjusts with the number of items in the active tab
  readonly topContentChartConfig = computed(() => ({
    type: 'bar' as const,
    height: Math.max(220, this.topItems().length * 44 + 56),
    toolbar: { show: false },
    fontFamily: 'Inter, sans-serif',
  }));

  readonly topContentColors     = ['#5A82A8'];
  readonly topContentDataLabels = { enabled: false };
  readonly topContentPlotOpts   = { bar: { horizontal: true, barHeight: '55%', borderRadius: 3 } };
  readonly topContentGrid       = { borderColor: '#f3f4f6', strokeDashArray: 3 };
  readonly topContentTooltip    = computed(() => ({
    y: { formatter: (v: number) =>
      `${v} ${this.activeTab() === 'podcasts' ? 'play' : 'view'}${v !== 1 ? 's' : ''}` },
  }));

  // ── Helpers ────────────────────────────────────────────────────────────────

  fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  truncate(text: string, max = 80): string {
    return text.length <= max ? text : text.slice(0, max).trimEnd() + '…';
  }

  devotionalLabel(d: { day: number; month: number; year: number; title: string }): string {
    return `${d.day}/${d.month}/${d.year} — ${d.title}`;
  }
}
