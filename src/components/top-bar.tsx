import Link from "next/link";
import { logout } from "@/app/actions";
import { unreadCount } from "@/lib/notifications";

type User = { id: string; name: string; role: string; team: { name: string } };

/** Shared header for signed-in pages, with the notification bell. */
export async function TopBar({ user }: { user: User }) {
  const unread = await unreadCount(user.id);
  return (
    <header className="topbar">
      <Link href="/dashboard" className="brand">
        Codeless Test Automation
      </Link>
      <span className="muted">
        {user.name} · {user.role === "ADMIN" ? "Admin" : "Member"} · {user.team.name}
      </span>
      <Link href="/notifications" className="bell" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
        <span aria-hidden="true">🔔</span>
        {unread > 0 && (
          <span className="bell-count" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
      <form action={logout}>
        <button type="submit" className="secondary">
          Log out
        </button>
      </form>
    </header>
  );
}
