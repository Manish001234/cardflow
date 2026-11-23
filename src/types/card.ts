import { z } from 'zod';

export const editableFields = [
  'fullName', 'jobTitle', 'companyName', 'email', 'phone',
  'website', 'address', 'notes',
] as const;
export type EditableField = (typeof editableFields)[number];

export const cardSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  jobTitle: z.string(),
  companyName: z.string(),
  email: z.string(),
  phone: z.string(),
  website: z.string(),
  address: z.string(),
  notes: z.string(),
  confidenceScore: z.enum(['High', 'Medium', 'Low']),
}).strict();

export type BusinessCard = z.infer<typeof cardSchema>;
export interface StoredCard extends BusinessCard {
  revision?: number;
  images?: { front?: { pathname: string; size: number; contentType: string }; back?: { pathname: string; size: number; contentType: string } };
  preview: string;
  createdAt: string;
  sourceName: string;
  backPreview?: string;
  reviewedAt?: string;
  favorite?: boolean;
  tags?: string[];
}
export interface ExtractionFailure { fileName: string; message: string; }
export interface ExtractResponse { cards: BusinessCard[]; errors: ExtractionFailure[]; }
