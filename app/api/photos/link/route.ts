import { handleLink } from "@/lib/photos/route";

/** Owner only: find the picture of a pasted link (og:image), with strict safety limits. See lib/photos/link.ts. */
export async function POST(request: Request) {
  return handleLink(request);
}
