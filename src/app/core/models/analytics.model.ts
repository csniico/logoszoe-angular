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
    quizSubmissions: number;
  };
  topArticles: TopContent[];
  topDevotionals: TopDevotional[];
  topPodcasts: TopPodcast[];
  topPosts: TopPost[];
  userGrowth: UserGrowthPoint[];
}
