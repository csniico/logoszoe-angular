export type ResourceType = 'image' | 'audio' | 'video' | 'document';

export interface AssetReference {
  collection: string;
  documentId: string;
  field: string;
}

export interface StorageAsset {
  _id: string;
  key: string;
  url: string;
  bucket: string;
  mimeType?: string;
  resourceType: ResourceType;
  references: AssetReference[];
  syncedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StorageStats {
  total: number;
  image: number;
  audio: number;
  video: number;
  document: number;
}
