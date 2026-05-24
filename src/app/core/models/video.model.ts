export interface Video {
  _id: string;
  youtubeId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  thumbnailKey: string;
  category: string;
  createdAt?: string;
  updatedAt?: string;
}
