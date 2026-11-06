// MapLibre runs its tile parser in a web worker. Bundlers break the automatic worker URL, so the
// app serves the worker file itself (see components/map/map-view.tsx). Runs after `npm install`.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

const from = "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs";
if (!existsSync(from)) process.exit(0); // maplibre-gl not installed (e.g. a partial install): nothing to copy
mkdirSync("public/maplibre", { recursive: true });
copyFileSync(from, "public/maplibre/maplibre-gl-worker.mjs");
