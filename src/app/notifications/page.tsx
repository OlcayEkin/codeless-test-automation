import { TopBar } from "@/components/top-bar";
import { listNotifications } from "@/lib/notifications";
import { requireUser } from "@/lib/session";
import { markAllReadAction, openNotificationAction } from "../plans/actions";

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await listNotifications(user.id);
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <>
      <TopBar user={user} />
      <main className="page narrow">
        <div className="page-head">
          <h1>Notifications</h1>
          {unread > 0 && (
            <form action={markAllReadAction}>
              <button type="submit" className="secondary">
                Mark all as read
              </button>
            </form>
          )}
        </div>
        {notifications.length === 0 ? (
          <section className="card empty">
            <h2>Nothing yet</h2>
            <p className="muted">You will get a notification here when a test run you started finishes.</p>
          </section>
        ) : (
          <ul className="notifications" aria-label="Notifications">
            {notifications.map((n) => (
              <li key={n.id} className={n.readAt ? "notification read" : "notification unread"}>
                <form action={openNotificationAction.bind(null, n.id)}>
                  <button type="submit" className="notification-button">
                    <span className="notification-title">
                      {!n.readAt && <span className="sr-only">Unread: </span>}
                      {n.title}
                    </span>
                    <span className="muted">{n.body}</span>
                    <span className="muted small">{n.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
