/**
 * The manifest's share target opens the app with `title`, `text` and `url` query parameters.
 * Returns the in-app route that imports what was shared, or null for an ordinary start.
 */
export function shareTargetRoute(search: string): string | null {
  const params = new URLSearchParams(search);
  const text = params.get('text')?.trim() ?? '';
  const pattern = /https?:\/\/\S+/i;
  // A title or a line of comment around a link shares the page; a whole recipe that only
  // names its source (three or more lines besides the link) is imported as text.
  const recipeText =
    text
      .replace(new RegExp(pattern, 'gi'), '')
      .split('\n')
      .filter((line) => line.trim()).length >= 3;
  const link = [params.get('url') ?? '', recipeText ? '' : text]
    .map((value) => pattern.exec(value)?.[0])
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
