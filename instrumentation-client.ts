import { z } from "zod";

// Runs in the browser before any app code. Zod 4 probes `new Function("")` once to decide whether it may compile
// faster parsers; the probe is caught and harmless, but a Content-Security-Policy still logs it as a violation.
// `jitless` skips the probe and uses the normal parser. Forms here are tiny, so nothing measurable is lost.
z.config({ jitless: true });
