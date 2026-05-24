export interface Prayer {
  _id: string;
  userId: string;
  name?: string;
  email?: string;
  phone?: string;
  topic: string;
  title: string;
  message: string;
  anonymous: boolean;
  responses?: string[];
  createdAt?: string;
  updatedAt?: string;
}
