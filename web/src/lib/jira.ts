/**
 * RF-76: any list becomes a Jira search. Cadência stays read-only — this is a link the person opens
 * in Jira, where acting on the items (moving, reassigning, commenting) belongs.
 */
const MAX_KEYS = 200; // beyond this Jira's URL gets unwieldy; the first 200 still make the point

export function jiraSearchUrl(baseUrl: string | null | undefined, keys: string[]): string | null {
  const unique = [...new Set(keys.filter(Boolean))].slice(0, MAX_KEYS);
  if (!baseUrl || !unique.length) return null;
  const jql = `key in (${unique.join(', ')}) ORDER BY Rank ASC`;
  return `${baseUrl.replace(/\/$/, '')}/issues/?jql=${encodeURIComponent(jql)}`;
}

/** The instance address, from any issue URL the API already sent (`…/browse/KEY`). */
export function baseFromIssueUrl(url: string | null | undefined): string | null {
  const match = url?.match(/^(.*)\/browse\/[^/]+$/);
  return match ? match[1] : null;
}
