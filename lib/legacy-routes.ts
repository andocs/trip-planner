/**
 * Old links keep working. /plan was split into Itinerary, Flights and Stays; the Ideas tab and the Food and
 * Attractions tabs became category filters on Places. Returns the new address, or null when the path is current.
 * (Done here, not with next.config redirects, which would carry the old `?tab=` over to the new address.)
 */
export function legacyRedirect(pathname: string, search: URLSearchParams): string | null {
  const tab = search.get("tab");
  if (pathname === "/plan") {
    if (tab === "flights") return "/flights";
    if (tab === "stays") return "/stays";
    if (tab === "ideas") return "/places?cat=stay";
    return "/itinerary";
  }
  if (pathname === "/places") {
    if (tab === "food") return "/places?cat=food";
    if (tab === "attractions") return "/places?cat=sight";
  }
  return null;
}
