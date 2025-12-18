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

export interface PaymentNotification {
  userId: string;
  telegramId: number;
  status: 'success' | 'failed' | 'cancelled';
  amount: number;
  paymentType: 'plan' | 'package';
  itemName: string;
}

/**
 * Send notification to Telegram bot when lecture processing completes
 */
export async function sendLectureNotification(notification: LectureNotification): Promise<void> {
  const botWebhookUrl = config.telegram.botWebhookUrl;
  const webhookSecret = config.telegram.webhookSecret;

  logger.info({
    botWebhookUrl: botWebhookUrl ? `${botWebhookUrl.substring(0, 20)}...` : 'NOT SET',
    hasWebhookSecret: !!webhookSecret,
    lectureId: notification.lectureId
  }, 'Preparing to send notification');

  if (!botWebhookUrl) {
    logger.warn({ lectureId: notification.lectureId }, 'Bot webhook URL not configured, skipping notification');
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

    const webhookUrl = botWebhookUrl + '/webhook/lecture';
    logger.info({
      telegramId: user.telegramId,
      lectureId: notification.lectureId,
      status: notification.status,
      webhookUrl,
    }, 'Sending notification to bot');

    const response = await fetch(webhookUrl, {
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

/**
 * Send payment notification to Telegram bot
 */
export async function sendPaymentNotification(notification: PaymentNotification): Promise<void> {
  const botWebhookUrl = config.telegram.botWebhookUrl;

  logger.info({
    botWebhookUrl: botWebhookUrl ? `${botWebhookUrl.substring(0, 20)}...` : 'NOT SET',
    telegramId: notification.telegramId,
    status: notification.status,
  }, 'Preparing to send payment notification');

  if (!botWebhookUrl) {
    logger.warn('Bot webhook URL not configured, skipping payment notification');
    return;
  }

  try {
    const payload = {
      type: 'payment_notification',
      telegramId: notification.telegramId,
      status: notification.status,
      amount: notification.amount,
      paymentType: notification.paymentType,
      itemName: notification.itemName,
    };

    const webhookUrl = botWebhookUrl + '/webhook/payment';
    logger.info({
      telegramId: notification.telegramId,
      status: notification.status,
      amount: notification.amount,
      webhookUrl,
    }, 'Sending payment notification to bot');

    const response = await fetch(webhookUrl, {
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
      }, 'Failed to send payment notification to bot');
    } else {
      logger.info({ telegramId: notification.telegramId }, 'Payment notification sent successfully');
    }
  } catch (error) {
    logger.error({ error, telegramId: notification.telegramId }, 'Error sending payment notification to bot');
  }
}
