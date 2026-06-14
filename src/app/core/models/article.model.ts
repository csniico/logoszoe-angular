export interface ArticleCategory {
  _id: string;
  name: string;
  slug: string;
  color?: string;
}

export interface Article {
  _id: string;
  title: string;
  slug: string;
  content: string;
  imageUrl?: string;
  imageKey?: string;
  /** Populated as ArticleCategory when returned by getAll(); raw ObjectId string otherwise */
  category: string | ArticleCategory;
  author?: string;
  comments?: string[];
  hits?: number;
  published?: boolean;
  biblePassages?: { ref: string; passage: string[] }[];
  createdAt?: string;
  updatedAt?: string;
}

/** Narrow helper - returns the populated shape if present */
export function articleCat(article: Article): ArticleCategory | null {
  if (article.category && typeof article.category === 'object') {
    return article.category as ArticleCategory;
  }
  return null;
}
