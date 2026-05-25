import cron from 'node-cron';
import Notification from '../core/Notification.model.js';
import { dispatchNotification } from '../core/notification.service.js';
import { logger } from '../../../utils/logger.js';

const LOCK_DURATION_MS = 60000;  // 60s lock timeout
const BATCH_SIZE = 20;           // jobs per poll tick
const POLL_SCHEDULE = '*/10 * * * * *'; // every 10 seconds

let isRunning = false;
let batchCount = 0; // Heartbeat tracker

async function processBatch() {
  if (isRunning) return;
  isRunning = true;
  batchCount++;

  try {
    const now = new Date();
    const lockExpiry = new Date(now.getTime() + LOCK_DURATION_MS);

    // Periodic Heartbeat log (every 5 batches)
    if (batchCount % 5 === 0) {
      logger.info('[NotificationWorker] Heartbeat: Loop is active.');
    }

    // Atomic claim loop
    const jobs = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      const job = await Notification.findOneAndUpdate(
        {
          status: { $in: ['PENDING', 'FAILED'] },
          nextRunAt: { $lte: now },
          attempts: { $lt: 3 },
          $or: [
            { lockedUntil: null },
            { lockedUntil: { $lte: now } },
          ],
        },
        {
          $set: {
            status: 'PROCESSING',
            lockedAt: now,
            lockedUntil: lockExpiry,
          },
          $inc: { attempts: 1 },
        },
        { new: true, sort: { nextRunAt: 1 } }
      );
      if (!job) break;
      jobs.push(job);
    }

    if (jobs.length === 0) return;

    logger.info(`[NotificationWorker] Processing ${jobs.length} jobs`);

    // Process all claimed jobs in parallel
    await Promise.allSettled(jobs.map(job => processJob(job)));

  } catch (err) {
    logger.error('[NotificationWorker] Batch processing failed:', err);
  } finally {
    isRunning = false;
  }
}

async function processJob(job) {
  try {
    const result = await dispatchNotification(job);

    if (result.success) {
      await Notification.findByIdAndUpdate(job._id, {
        status: 'SENT',
        fcmMessageId: result.skipped ? `skipped:${result.reason}` : result.fcmMessageId,
        sentAt: new Date(),
        lockedAt: null,
        lockedUntil: null,
      });
    } else {
      await markJobFailed(job, result.reason ?? 'DISPATCH_FAILED');
    }
  } catch (err) {
    logger.error(`[NotificationWorker] Job ${job._id} crashed:`, err);
    await markJobFailed(job, err.message);
  }
}

async function markJobFailed(job, reason) {
  const isFinalAttempt = job.attempts >= job.maxAttempts;

  // Exponential backoff: 1min → 5min → 15min
  const backoffMs = [60000, 300000, 900000][job.attempts - 1] ?? 900000;
  const nextRunAt = isFinalAttempt ? undefined : new Date(Date.now() + backoffMs);

  await Notification.findByIdAndUpdate(job._id, {
    status: isFinalAttempt ? 'FAILED' : 'PENDING',
    failureReason: reason,
    nextRunAt: nextRunAt || job.nextRunAt, // Keep last run time if final
    lockedAt: null,
    lockedUntil: null,
  });

  if (isFinalAttempt) {
    logger.error(`[NotificationWorker] Job ${job._id} permanently failed after ${job.attempts} attempts: ${reason}`);
  }
}

export function startNotificationWorker() {
  cron.schedule(POLL_SCHEDULE, processBatch);
  logger.info('[NotificationWorker] Background polling started (every 10s)');
}
