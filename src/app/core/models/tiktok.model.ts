/** A cached TikTok video served from our backend, never fetched from TikTok directly. */
export interface TiktokVideo {
  _id: string;
  /** TikTok's own video id - the handle used by every admin endpoint. */
  videoId: string;
  openId: string;
  title?: string;
  videoDescription?: string;
  /** Seconds. */
  duration?: number;
  height?: number;
  width?: number;
  /**
   * TikTok expires this link after roughly 6 hours. The backend renews it on a
   * cron, so a broken thumbnail here means the refresh job is failing.
   */
  coverImageUrl?: string;
  coverImageFetchedAt?: string;
  shareUrl?: string;
  /** Embed URL used for playback - TikTok's ToS requires their own player. */
  embedLink?: string;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  viewCount?: number;
  createTime: string;
  /** Admin curation flag - hidden videos stay cached but leave the public feed. */
  isVisible: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Connection health for the org account. Never carries token material. */
export interface TiktokStatus {
  connected: boolean;
  cachedVideos: number;
  openId?: string;
  displayName?: string;
  avatarUrl?: string;
  scopes?: string[];
  lastSyncedAt?: string;
  lastSyncError?: string;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
}

/**
 * Echo of the backend's TikTok configuration, for setup troubleshooting.
 * TikTok reports an unregistered redirect URI as a `client_key` error, so
 * seeing the exact URI the backend sends is what makes that error diagnosable.
 */
export interface TiktokConfigCheck {
  clientKeyPresent: boolean;
  clientKey: string;
  clientSecretPresent: boolean;
  encryptionKeyPresent: boolean;
  redirectUri: string;
  scopes: string;
  syncEnabled: boolean;
  coverRefreshHours: number;
}

export interface TiktokSyncResult {
  ingested: number;
  updated: number;
  pagesFetched: number;
}
