import { readFile, writeFile } from "fs/promises";
import { createSlug } from "../src/lib/shared-utils.js";

async function fixVenueReferencesInCalendar() {
  console.log("Loading venue data to build resolution map...");
  
  // Load venues data
  const venuesData = JSON.parse(await readFile("./src/data/venues.json", "utf-8"));
  
  // Create venue ID resolution map
  const venueIdResolutionMap = new Map();
  venuesData.venues.forEach((venue) => {
    // Map venue's own ID to itself
    venueIdResolutionMap.set(venue.id, venue.id);
    
    // Map potential old IDs (based on aliases) to this venue's ID
    if (venue.aliases) {
      venue.aliases.forEach((alias) => {
        // Create potential old venue ID from alias
        const potentialOldId = createSlug(alias);
        venueIdResolutionMap.set(potentialOldId, venue.id);
      });
    }
  });

  console.log(`Built resolution map with ${venueIdResolutionMap.size} mappings`);
  
  // Function to resolve a venue ID to the current correct ID
  function resolveVenueId(venueId) {
    return venueIdResolutionMap.get(venueId) || venueId;
  }

  // Load calendar data
  console.log("Loading calendar data...");
  const calendarData = JSON.parse(await readFile("./src/data/calendar.json", "utf-8"));
  
  let totalResolutions = 0;
  let affectedEvents = 0;
  
  // Process each show and event
  for (const show of calendarData.shows || []) {
    for (const event of show.events || []) {
      if (event.venue && event.venue.id) {
        const originalId = event.venue.id;
        const resolvedId = resolveVenueId(originalId);
        if (originalId !== resolvedId) {
          console.log(`  Resolving ${originalId} -> ${resolvedId} for event "${event.summary}"`);
          event.venue.id = resolvedId;
          totalResolutions++;
          affectedEvents++;
        }
      }
    }
  }
  
  console.log(`Total venue ID resolutions: ${totalResolutions}`);
  console.log(`Events affected: ${affectedEvents}`);
  
  if (totalResolutions > 0) {
    console.log("Writing updated calendar data...");
    await writeFile("./src/data/calendar.json", JSON.stringify(calendarData, null, 2));
    console.log("Calendar data updated successfully!");
  } else {
    console.log("No venue ID resolutions needed in calendar data.");
  }
}

fixVenueReferencesInCalendar().catch(console.error);