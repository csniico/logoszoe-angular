import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgApexchartsModule } from 'ng-apexcharts';
import { AnalyticsService } from '../../core/services/analytics.service';
import {
  AnalyticsOverview,
  AnalyticsTimeseries,
  TimeRange,
} from '../../core/models/analytics.model';

type ChartSeries = { name: string; data: number[] }[];

const RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '2w', label: '2W' },
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
];

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

  // Top-content tab
  readonly activeTab = signal<'articles' | 'devotionals' | 'podcasts'>('articles');

  // Collapsible cards (right column)
  readonly topContentOpen = signal(true);
  readonly topPostsOpen   = signal(true);

  // ── Trends (revenue + engagement) ──────────────────────────────────────────
  readonly rangeOptions   = RANGE_OPTIONS;
  readonly range          = signal<TimeRange>('1m');
  readonly ts             = signal<AnalyticsTimeseries | null>(null);
  readonly tsLoading      = signal(false);
  readonly revenueType    = signal<'bar' | 'line'>('bar');
  readonly engagementType = signal<'bar' | 'line'>('line');

  ngOnInit(): void {
    this.analyticsService.getOverview().subscribe({
      next:  (d) => { this.data.set(d);  this.loading.set(false); },
      error: ()  => { this.error.set('Failed to load analytics.'); this.loading.set(false); },
    });
    this.loadTimeseries();
  }

  setRange(r: TimeRange): void {
    if (r === this.range()) return;
    this.range.set(r);
    this.loadTimeseries();
  }

  private loadTimeseries(): void {
    this.tsLoading.set(true);
    this.analyticsService.getTimeseries(this.range()).subscribe({
      next:  (d) => { this.ts.set(d); this.tsLoading.set(false); },
      error: ()  => { this.tsLoading.set(false); },
    });
  }

  // ── Aggregate stats ────────────────────────────────────────────────────────

  readonly totalContent = computed(() => {
    const c = this.data()?.content;
    if (!c) return 0;
    return c.articles + c.devotionals + c.podcasts + c.videos +
           c.courses  + c.courseVideos + c.posts   + c.prayers;
  });

  // ── Content breakdown (pie) ─────────────────────────────────────────────────

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

  readonly pieSeries = computed(() => this.contentItems().map(i => i.count));
  readonly pieLabels = computed(() => this.contentItems().map(i => i.label));
  readonly pieColors = computed(() => this.contentItems().map(i => i.color));

  readonly pieChart = {
    type: 'donut' as const,
    height: 290,
    fontFamily: 'Inter, sans-serif',
  };
  readonly pieDataLabels = { enabled: false };
  readonly pieStroke     = { width: 2, colors: ['#ffffff'] };
  readonly pieLegend     = {
    position: 'bottom' as const,
    fontSize: '11px',
    fontFamily: 'Inter, sans-serif',
    labels: { colors: '#6b7280' },
    itemMargin: { horizontal: 6, vertical: 2 },
  };
  readonly piePlotOpts = computed(() => ({
    pie: {
      donut: {
        size: '64%',
        labels: {
          show: true,
          total: {
            show: true,
            label: 'Total',
            fontSize: '12px',
            fontFamily: 'Inter, sans-serif',
            color: '#9ca3af',
            formatter: () => `${this.totalContent()}`,
          },
        },
      },
    },
  }));
  readonly pieTooltip = { y: { formatter: (v: number) => `${v} item${v !== 1 ? 's' : ''}` } };

  // ── Top content list (right column) ─────────────────────────────────────────

  readonly topContentList = computed(() => {
    const d = this.data();
    const tab = this.activeTab();
    if (!d) return [] as { label: string; hits: number }[];
    if (tab === 'articles')    return d.topArticles.map(i => ({ label: i.title, hits: i.hits }));
    if (tab === 'devotionals') return d.topDevotionals.map(i => ({ label: this.devotionalLabel(i), hits: i.hits }));
    return d.topPodcasts.map(i => ({ label: i.title, hits: i.hits }));
  });

  readonly topContentUnit = computed(() => (this.activeTab() === 'podcasts' ? 'play' : 'view'));

  // ── Trends: revenue chart ───────────────────────────────────────────────────

  readonly revenueSeries = computed<ChartSeries>(() => [
    { name: 'Revenue', data: (this.ts()?.revenue ?? []).map(p => p.value) },
  ]);
  readonly revenueXAxis = computed(() => ({
    categories: (this.ts()?.revenue ?? []).map(p => this.tsLabel(p.date)),
    labels: {
      rotate: -45,
      rotateAlways: false,
      hideOverlappingLabels: true,
      style: { fontSize: '10px', colors: '#9ca3af', fontFamily: 'Inter,sans-serif' },
    },
    axisBorder: { show: false },
    axisTicks:  { show: false },
    tooltip:    { enabled: false },
  }));
  readonly revenueChart = computed(() => ({
    type: this.revenueType(),
    height: 280,
    toolbar: { show: false },
    fontFamily: 'Inter, sans-serif',
  }));
  readonly revenueStroke = computed(() => ({
    curve: 'smooth' as const,
    width: this.revenueType() === 'line' ? 3 : 0,
  }));
  readonly revenueColors     = ['#C9A059'];
  readonly revenueDataLabels = { enabled: false };
  readonly revenuePlotOpts   = { bar: { columnWidth: '58%', borderRadius: 3 } };
  readonly revenueGrid       = { borderColor: '#f3f4f6', strokeDashArray: 3 };
  readonly revenueYAxis      = {
    labels: {
      style: { fontSize: '11px', colors: '#9ca3af', fontFamily: 'Inter,sans-serif' },
      formatter: (v: number) => this.compact(v),
    },
  };
  readonly revenueTooltip = { y: { formatter: (v: number) => this.money(v) } };

  // ── Trends: engagement chart ────────────────────────────────────────────────

  readonly engagementSeries = computed<ChartSeries>(() => [
    { name: 'Lesson completions', data: (this.ts()?.engagement ?? []).map(p => p.value) },
  ]);
  readonly engagementXAxis = computed(() => ({
    categories: (this.ts()?.engagement ?? []).map(p => this.tsLabel(p.date)),
    labels: {
      rotate: -45,
      rotateAlways: false,
      hideOverlappingLabels: true,
      style: { fontSize: '10px', colors: '#9ca3af', fontFamily: 'Inter,sans-serif' },
    },
    axisBorder: { show: false },
    axisTicks:  { show: false },
    tooltip:    { enabled: false },
  }));
  readonly engagementChart = computed(() => ({
    type: this.engagementType(),
    height: 280,
    toolbar: { show: false },
    fontFamily: 'Inter, sans-serif',
  }));
  readonly engagementStroke = computed(() => ({
    curve: 'smooth' as const,
    width: this.engagementType() === 'line' ? 3 : 0,
  }));
  readonly engagementColors     = ['#5A82A8'];
  readonly engagementDataLabels = { enabled: false };
  readonly engagementPlotOpts   = { bar: { columnWidth: '58%', borderRadius: 3 } };
  readonly engagementGrid       = { borderColor: '#f3f4f6', strokeDashArray: 3 };
  readonly engagementYAxis      = {
    labels: {
      style: { fontSize: '11px', colors: '#9ca3af', fontFamily: 'Inter,sans-serif' },
      formatter: (v: number) => `${Math.round(v)}`,
    },
  };
  readonly engagementTooltip = {
    y: { formatter: (v: number) => `${v} completion${v !== 1 ? 's' : ''}` },
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  tsLabel(iso: string): string {
    const d = new Date(iso);
    const unit = this.ts()?.unit ?? 'day';
    if (unit === 'month') return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  money(v: number): string {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GHS',
      maximumFractionDigits: 2,
    }).format(v);
  }

  compact(v: number): string {
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return `${v}`;
  }

  truncate(text: string, max = 80): string {
    return text.length <= max ? text : text.slice(0, max).trimEnd() + '…';
  }

  devotionalLabel(d: { day: number; month: number; year: number; title: string }): string {
    return `${d.day}/${d.month}/${d.year} — ${d.title}`;
  }
}
