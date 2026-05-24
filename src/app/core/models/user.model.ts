export type UserRole = 'user' | 'admin';
export type UserSession = 'active' | 'inactive' | 'expired';

export interface UserBookmark {
  id: string;
  title: string;
  image?: string;
  type: 'article' | 'devotional' | 'podcast' | 'verse';
}

export interface User {
  _id: string;
  firstname: string;
  lastname?: string;
  email: string;
  googleId?: string;
  role: UserRole;
  profilePicture?: string;
  profilePictureKey?: string;
  bookmarks?: UserBookmark[];
  session: UserSession;
  createdAt?: string;
  updatedAt?: string;
}
