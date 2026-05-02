import { readFile } from "fs/promises";
import { resolve as resolvePath } from "path";
import type {
  NonArtistFiltersConfig,
  VenueRulesConfig,
  SpellingCorrectionsConfig,
} from "./schemas.js";
import {
  NonArtistFiltersConfigSchema,
  VenueRulesConfigSchema,
  SpellingCorrectionsConfigSchema,
} from "./schemas.js";

const CONFIG_DIR = resolvePath(import.meta.dirname, "..", "config");
const DATA_DIR = resolvePath(import.meta.dirname, "..", "..", "src", "data");

export interface PipelineConfig {
  nonArtistFilters: NonArtistFiltersConfig;
  venueRules: VenueRulesConfig;
  spellingCorrections: SpellingCorrectionsConfig;
}

export async function loadConfig(): Promise<PipelineConfig> {
  const [filtersRaw, venueRulesRaw, spellingRaw] = await Promise.all([
    readFile(resolvePath(CONFIG_DIR, "non-artist-filters.json"), "utf-8"),
    readFile(resolvePath(CONFIG_DIR, "venue-rules.json"), "utf-8"),
    readFile(resolvePath(DATA_DIR, "spelling-corrections.json"), "utf-8"),
  ]);

  const nonArtistFilters = NonArtistFiltersConfigSchema.parse(
    JSON.parse(filtersRaw),
  );
  const venueRules = VenueRulesConfigSchema.parse(JSON.parse(venueRulesRaw));
  const spellingCorrections = SpellingCorrectionsConfigSchema.parse(
    JSON.parse(spellingRaw),
  );

  return { nonArtistFilters, venueRules, spellingCorrections };
}

export function resolveDataPath(filename: string): string {
  return resolvePath(DATA_DIR, filename);
}

export function resolveProjectPath(...segments: string[]): string {
  return resolvePath(import.meta.dirname, "..", "..", ...segments);
}