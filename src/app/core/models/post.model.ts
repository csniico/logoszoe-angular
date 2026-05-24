export interface PostImage {
  url: string;
  key: string;
}

export interface Post {
  _id: string;
  parentId: string | null;
  anonymous: boolean;
  userId?: string;
  userName?: string;
  userAvatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  text: string;
  images: PostImage[];
  likeCount: number;
  bookmarkCount: number;
  replyCount: number;
  shareCount: number;
  liked: boolean;
  bookmarked: boolean;
}
