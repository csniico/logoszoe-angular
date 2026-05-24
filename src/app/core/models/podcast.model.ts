export type PodcastCategory = 'word-of-faith' | 'podcast' | 'prayers';

export const PODCAST_CATEGORIES: { value: PodcastCategory; label: string }[] = [
  { value: 'word-of-faith', label: 'Word of Faith' },
  { value: 'podcast', label: 'Podcast' },
  { value: 'prayers', label: 'Prayers' },
];

export interface Podcast {
  _id: string;
  title: string;
  description: string;
  category: PodcastCategory;
  slug: string;
  imageUrl?: string;
  imageKey?: string;
  audioUrl: string;
  audioKey: string;
  hits: number;
  createdAt?: string;
  updatedAt?: string;
}
