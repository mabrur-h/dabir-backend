import { createLogger } from '../../utils/logger.js';
import { config } from '../../config/index.js';
import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';

const logger = createLogger('notification-service');

export interface LectureNotification {
  lectureId: string;
  userId: string;
  status: 'completed' | 'failed';
  title?: string;
  summarizationType?: string;
  errorMessage?: string;
}

/**
 * Send notification to Telegram bot when lecture processing completes
 */
export async function sendLectureNotification(notification: LectureNotification): Promise<void> {
  const botWebhookUrl = config.telegram.botWebhookUrl;
  
  if (!botWebhookUrl) {
    logger.debug({ lectureId: notification.lectureId }, 'Bot webhook URL not configured, skipping notification');
    return;
  }

  try {
    // Get user's telegram ID
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, notification.userId),
      columns: {
        telegramId: true,
        telegramFirstName: true,
      },
    });

    if (!user?.telegramId) {
      logger.debug({ userId: notification.userId }, 'User has no telegram ID, skipping notification');
      return;
    }

    const payload = {
      type: 'lecture_notification',
      telegramId: user.telegramId,
      lectureId: notification.lectureId,
      status: notification.status,
      title: notification.title,
      summarizationType: notification.summarizationType,
      errorMessage: notification.errorMessage,
    };

    logger.info({ 
      telegramId: user.telegramId, 
      lectureId: notification.lectureId,
      status: notification.status 
    }, 'Sending notification to bot');

    const response = await fetch(botWebhookUrl + '/webhook/lecture', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.telegram.webhookSecret,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ 
        status: response.status, 
        error: errorText 
      }, 'Failed to send notification to bot');
    } else {
      logger.info({ lectureId: notification.lectureId }, 'Notification sent successfully');
    }
  } catch (error) {
    logger.error({ error, lectureId: notification.lectureId }, 'Error sending notification to bot');
  }
}
