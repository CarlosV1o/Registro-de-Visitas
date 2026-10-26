import { getAttendance, getEmployees, getEvent } from "./api";
import { cache } from "./cache";

const pending = new Map<string, Promise<void>>();

// Warms the cache when a pointer or keyboard focus reaches an event link, so the
// event opens with its data instead of a loading state. Failures are ignored here
// because the event page reports them when it loads.
export function prefetchEvent(eventId: string) {
  if (pending.has(eventId)) return;

  if (cache.event(eventId) && cache.attendance(eventId) && cache.employees()) return;

  const generation = cache.generation();

  const request = Promise.all([
    getEvent(eventId),
    getAttendance(eventId),
    cache.employees() ?? getEmployees(),
  ])
    .then(([event, records, employees]) => {
      if (generation !== cache.generation()) return;

      cache.setEvent(eventId, event);
      cache.setAttendance(eventId, records);
      cache.setEmployees(employees);
    })
    .catch(() => undefined)
    .finally(() => pending.delete(eventId));

  pending.set(eventId, request);
}

export function pendingPrefetch(eventId: string) {
  return pending.get(eventId);
}
