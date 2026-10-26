export function appLink(path = "") {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
}

export function eventLink(eventId: string) {
  return appLink(`eventos/${encodeURIComponent(eventId)}`);
}

export function reportLink(eventId: string) {
  return appLink(`admin/eventos/${encodeURIComponent(eventId)}`);
}
