import { describeSchedule, formatWhen, isRepeat } from "@/lib/schedule";
import { deleteScheduleAction, setScheduleActiveAction } from "../actions";

type Schedule = {
  id: string;
  repeat: string;
  startAt: Date;
  nextRunAt: Date | null;
  active: boolean;
  testTypes: string;
  headless: boolean;
  createdBy: { name: string };
};

export function ScheduleList({ planId, schedules }: { planId: string; schedules: Schedule[] }) {
  return (
    <section className="card" aria-labelledby="schedules-heading">
      <h2 id="schedules-heading">Schedules</h2>
      {schedules.length ? (
        <ul className="schedules">
          {schedules.map((schedule) => (
            <li key={schedule.id} className="schedule">
              <div>
                <strong>{isRepeat(schedule.repeat) ? describeSchedule(schedule.repeat, schedule.startAt) : schedule.repeat}</strong>
                <span className="muted small">
                  {schedule.testTypes.split(",").map((t) => t.toUpperCase()).join(" + ")} · Chrome · {schedule.headless ? "headless" : "browser shown"} · by{" "}
                  {schedule.createdBy.name}
                </span>
                <span className={schedule.active ? "small" : "muted small"}>
                  {schedule.active && schedule.nextRunAt ? `Next run: ${formatWhen(schedule.nextRunAt)}` : "Stopped"}
                </span>
              </div>
              <div className="schedule-actions">
                <form action={setScheduleActiveAction.bind(null, planId, schedule.id, !schedule.active)}>
                  <button type="submit" className="secondary small-button">
                    {schedule.active ? "Stop" : "Continue"}
                  </button>
                </form>
                <form action={deleteScheduleAction.bind(null, planId, schedule.id)}>
                  <button type="submit" className="secondary small-button" aria-label={`Delete schedule: ${isRepeat(schedule.repeat) ? describeSchedule(schedule.repeat, schedule.startAt) : ""}`}>
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No schedules. Choose “Schedule a date and repeat” when you run tests.</p>
      )}
    </section>
  );
}
