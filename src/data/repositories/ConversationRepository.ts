import { desc, eq, asc } from 'drizzle-orm';
import type { Database } from '../db/client';
import { conversationMessages } from '../db/schema';

const MAX_PER_CONVERSATION = 200;
const HISTORY_CONTEXT_LIMIT = 50;

export interface StoredMessage {
  sender: string;
  text: string;
  timestamp: number;
}

export class ConversationRepository {
  constructor(private readonly db: Database) {}

  // Persist thread messages from an Android MessagingStyle notification.
  // Uses INSERT OR IGNORE via the unique index on (conversation_key, timestamp, sender)
  // so re-delivered notifications are idempotent.
  async saveMessages(conversationKey: string, messages: StoredMessage[]): Promise<void> {
    if (messages.length === 0) return;
    const now = Date.now();
    for (const msg of messages) {
      try {
        await this.db.insert(conversationMessages).values({
          conversationKey,
          sender: msg.sender,
          text: msg.text.slice(0, 1000),
          timestamp: msg.timestamp,
          createdAt: now,
        });
      } catch {
        // Unique constraint violation = already stored — safe to ignore
      }
    }
    // Prune to rolling window per conversation
    await this._pruneConversation(conversationKey);
  }

  // Returns the most recent messages for a conversation, oldest-first so the
  // AI prompt reads chronologically (just like a chat thread).
  async getHistory(conversationKey: string, limit = HISTORY_CONTEXT_LIMIT): Promise<StoredMessage[]> {
    // Fetch newest `limit` rows, then reverse so oldest is first
    const rows = await this.db
      .select({
        sender: conversationMessages.sender,
        text: conversationMessages.text,
        timestamp: conversationMessages.timestamp,
      })
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationKey, conversationKey))
      .orderBy(desc(conversationMessages.timestamp))
      .limit(limit);
    return rows.reverse();
  }

  private async _pruneConversation(conversationKey: string): Promise<void> {
    const count = await this.db.$count(
      conversationMessages,
      eq(conversationMessages.conversationKey, conversationKey)
    );
    if (count <= MAX_PER_CONVERSATION) return;
    const excess = count - MAX_PER_CONVERSATION;
    const oldest = await this.db
      .select({ id: conversationMessages.id })
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationKey, conversationKey))
      .orderBy(asc(conversationMessages.timestamp))
      .limit(excess);
    for (const row of oldest) {
      await this.db.delete(conversationMessages).where(eq(conversationMessages.id, row.id));
    }
  }
}
