import { getAttendance, getEmployees, getEvent, getRoster } from "./api";
import { cache } from "./cache";

const pending = new Map<string, Promise<void>>();

// Warms the cache when a pointer or keyboard focus reaches an event link, so the
// event opens with its data instead of a loading state. Failures are ignored here
// because the event page reports them when it loads.
export function prefetchEvent(eventId: string) {
  if (pending.has(eventId)) return;

  if (
    cache.event(eventId) &&
    cache.attendance(eventId) &&
    cache.roster(eventId) &&
    cache.employees()
  )
    return;

  const generation = cache.generation();

  const request = Promise.all([
    getEvent(eventId),
    getAttendance(eventId),
    getRoster(eventId),
    cache.employees() ?? getEmployees(),
  ])
    .then(([event, records, roster, employees]) => {
      if (generation !== cache.generation()) return;

      cache.setEvent(eventId, event);
      cache.setAttendance(eventId, records);
      cache.setRoster(eventId, roster);
      cache.setEmployees(employees);
    })
    .catch(() => undefined)
    .finally(() => pending.delete(eventId));

  pending.set(eventId, request);
}

export function pendingPrefetch(eventId: string) {
  return pending.get(eventId);
}
