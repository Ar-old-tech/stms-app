import 'dotenv/config';
import {z} from 'zod';
export const configSchema=z.object({DATABASE_URL:z.string().min(1),JWT_SECRET:z.string().min(32),WEBHOOK_SECRET:z.string().min(32),DOCUMENT_KEY:z.string().regex(/^[a-f\d]{64}$/i),PORT:z.coerce.number().int().min(1).max(65535).default(3000),NODE_ENV:z.enum(['development','production','test']).default('development'),DEMO_ENABLED:z.enum(['true','false']).default('false'),DATABASE_SSL:z.enum(['true','false']).optional()});
export type Config=z.infer<typeof configSchema>;
export function config(){return configSchema.parse(process.env)}
