export interface TopContent {
  _id: string;
  title: string;
  hits: number;
}

export interface TopDevotional extends TopContent {
  day: number;
  month: number;
  year: number;
}

export interface TopPodcast extends TopContent {
  category: string;
}

export interface TopPost {
  _id: string;
  text: string;
  likeCount: number;
  shareCount: number;
  replyCount: number;
}

export interface UserGrowthPoint {
  _id: string; // 'YYYY-MM-DD'
  count: number;
}

export type TimeRange = '7d' | '2w' | '1m' | '3m' | '6m' | '1y';

export interface TimeseriesPoint {
  date: string; // ISO
  value: number;
}

export interface AnalyticsTimeseries {
  range: TimeRange;
  unit: 'day' | 'week' | 'month';
  revenue: TimeseriesPoint[];     // major currency units
  engagement: TimeseriesPoint[];  // lesson completions
}

export interface AnalyticsOverview {
  users: {
    total: number;
    newThisWeek: number;
    newThisMonth: number;
  };
  content: {
    articles: number;
    devotionals: number;
    podcasts: number;
    videos: number;
    courses: number;
    courseVideos: number;
    posts: number;
    prayers: number;
  };
  engagement: {
    lessonCompletions: number;
  };
  topArticles: TopContent[];
  topDevotionals: TopDevotional[];
  topPodcasts: TopPodcast[];
  topPosts: TopPost[];
  userGrowth: UserGrowthPoint[];
}
