import "server-only";
import { db } from "./db";

export const unreadCount = (userId: string) => db.notification.count({ where: { userId, readAt: null } });

export const listNotifications = (userId: string) =>
  db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, title: true, body: true, readAt: true, createdAt: true, runId: true },
  });

/** Marks one of the user's own notifications as read and returns the run it points to. */
export async function openNotification(userId: string, id: string) {
  const notification = await db.notification.findFirst({ where: { id, userId }, select: { id: true, runId: true } });
  if (!notification) return null;
  await db.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
  return notification;
}

export const markAllRead = (userId: string) => db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
