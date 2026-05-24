export type ProductStatus = 'coming_soon' | 'available' | 'out_of_stock' | 'pre-order';
export type ProductCategory = 'electronics' | 'fashion' | 'home' | 'books' | 'toys' | 'beauty' | 'sports' | 'automotive' | 'grocery' | 'health';

export const PRODUCT_STATUSES: { value: ProductStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'coming_soon', label: 'Coming Soon' },
  { value: 'out_of_stock', label: 'Out of Stock' },
  { value: 'pre-order', label: 'Pre-order' },
];

export const PRODUCT_CATEGORIES: { value: ProductCategory; label: string }[] = [
  { value: 'books', label: 'Books' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'fashion', label: 'Fashion' },
  { value: 'home', label: 'Home' },
  { value: 'toys', label: 'Toys' },
  { value: 'beauty', label: 'Beauty' },
  { value: 'sports', label: 'Sports' },
  { value: 'automotive', label: 'Automotive' },
  { value: 'grocery', label: 'Grocery' },
  { value: 'health', label: 'Health' },
];

export interface Product {
  _id: string;
  title: string;
  description: string;
  imageUrl: string;
  imageKey: string;
  price: number;
  slug: string;
  category: ProductCategory;
  quantity: number;
  status: ProductStatus;
  createdAt?: string;
  updatedAt?: string;
}
