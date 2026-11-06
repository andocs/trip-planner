/**
 * Vector map styles with OpenStreetMap data. Override with MAP_STYLE_URL_LIGHT / MAP_STYLE_URL_DARK
 * (OpenFreeMap, Protomaps or MapTiler). Do not point these at OSM's public tile servers: their usage
 * policy forbids production traffic. Read on the server and passed to the client by the root layout.
 */
export type MapStyles = { light: string; dark: string };

export function mapStyles(): MapStyles {
  return {
    light: process.env.MAP_STYLE_URL_LIGHT || "https://tiles.openfreemap.org/styles/positron",
    dark: process.env.MAP_STYLE_URL_DARK || "https://tiles.openfreemap.org/styles/dark",
  };
}
