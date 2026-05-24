import { BiblePassageRef } from './bible.model';

export interface Category {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  color?: string;
  bannerUrl?: string;
  bannerKey?: string;
  icon?: string;
  article_title?: string;
  article_body?: string;
  relatedArticles?: string[];
  comments?: string[];
  published: boolean;
  imageKeys?: string[];
  biblePassages?: BiblePassageRef[];
  createdAt?: string;
  updatedAt?: string;
}
