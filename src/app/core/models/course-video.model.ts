export interface CourseVideo {
  _id: string;
  title: string;
  description?: string;
  videoUrl: string;
  videoKey: string;
  thumbnailUrl?: string;
  thumbnailKey?: string;
  durationSec?: number;
  createdAt?: string;
  updatedAt?: string;
}
