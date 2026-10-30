// Schema metadata for the query layer. Versioned SQL migrations remain the source of truth.
import { pgSchema, text, jsonb, boolean, timestamp } from 'drizzle-orm/pg-core';
export const schema = pgSchema('finfolk');
export const members = schema.table('members', {
  userId: text('user_id').primaryKey(),
  profile: jsonb('profile').notNull(),
  deleted: boolean('deleted').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});
