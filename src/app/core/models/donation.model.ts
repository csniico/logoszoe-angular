// ── Donation (mirrors backend admin/donations response) ────────────────────────

export type DonationCategory = 'partnership' | 'oneTime';
export type DonationPlatform = 'ios' | 'android' | 'web' | 'unknown';

export interface Donation {
  _id: string;
  userId: string;
  /** Joined donor info from the backend. */
  donorName: string;
  donorEmail: string;
  transactionId: string;
  productIdentifier: string;
  category: DonationCategory;
  platform: DonationPlatform;
  purchaseDate: string;
  /** Smallest currency unit (e.g. cents). Optional. */
  amount?: number;
  currency?: string;
  createdAt: string;
  updatedAt?: string;
}
