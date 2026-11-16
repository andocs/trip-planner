import { z } from "zod";

/** Request bodies for /api/places/*. Everything is validated; nothing the browser sends reaches Google unchecked. */

const clean = (max: number) =>
  z
    .string()
    .transform((s) =>
      s
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .pipe(z.string().min(1).max(max));

export const SearchBody = z.object({
  kind: z.enum(["sight", "food", "stay"]),
  city: z.object({
    name: clean(80),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
});
export type SearchBody = z.infer<typeof SearchBody>;

/** A Google place ID: letters, digits, dash and underscore only. */
export const PlaceId = z.string().regex(/^[A-Za-z0-9_-]{10,300}$/);

export const DetailsBody = z.object({ placeId: PlaceId });

/** A photo resource name as Google returns it: places/<id>/photos/<ref>. */
export const PhotoName = z.string().regex(/^places\/[A-Za-z0-9_-]{10,300}\/photos\/[A-Za-z0-9_-]{10,1000}$/);
export const PhotoBody = z.object({ name: PhotoName, maxWidth: z.number().int().min(80).max(1200).default(640) });

export const ImageBody = z.object({
  name: clean(120),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** The text query and Google place type we search for, per kind. */
export const QUERY = {
  sight: { text: (c: string) => `top tourist attractions in ${c}`, type: "tourist_attraction" },
  food: { text: (c: string) => `best local restaurants in ${c}`, type: "restaurant" },
  stay: { text: (c: string) => `hotels in ${c}`, type: "lodging" },
} as const;
