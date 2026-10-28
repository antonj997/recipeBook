/**
 * The manifest's share target opens the app with `title`, `text` and `url` query parameters.
 * Returns the in-app route that imports what was shared, or null for an ordinary start.
 */
export function shareTargetRoute(search: string): string | null {
  const params = new URLSearchParams(search);
  const text = params.get('text')?.trim() ?? '';
  const link = [params.get('url') ?? '', text]
    .map((value) => /https?:\/\/\S+/i.exec(value)?.[0])
    .find(Boolean);
  if (link) return '/recipes/import?url=' + encodeURIComponent(link);
  if (text) return '/recipes/import?text=' + encodeURIComponent(text);
  return null;
}

/** The address to replace a shared start with, before the router reads it. */
export function sharedStartUrl(location: URL, hashRouting: boolean): string | null {
  const route = shareTargetRoute(location.search);
  if (!route) return null;
  return hashRouting ? location.pathname + '#' + route : route;
}
