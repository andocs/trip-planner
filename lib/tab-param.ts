/**
 * Switches a screen's sub-tab (`?tab=…`) without a network request. router.replace() would refetch
 * the whole page from the server; Next's own docs say native history.replaceState is synced with
 * usePathname/useSearchParams, so the screen re-renders from the new URL and nothing leaves the browser.
 * `null` clears the param (the default tab keeps the clean URL).
 */
export function setTabParam(tab: string | null) {
  setSearchParam("tab", tab);
}

/** Same idea for any single query parameter (e.g. which idea’s sheet is open). */
export function setSearchParam(name: string, value: string | null) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(name, value);
  else url.searchParams.delete(name);
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}
