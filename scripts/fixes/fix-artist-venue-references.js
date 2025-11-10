import { readFile, writeFile } from "fs/promises";
import { createSlug } from "../src/lib/shared-utils.js";

async function fixVenueReferencesInArtists() {
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

  // Load artists data
  console.log("Loading artists data...");
  const artistsData = JSON.parse(await readFile("./src/data/artists.json", "utf-8"));
  
  let totalResolutions = 0;
  let affectedArtists = 0;
  
  // Process each artist
  for (const artist of artistsData.artists) {
    if (artist.venues && Array.isArray(artist.venues)) {
      let artistHadChanges = false;
      const resolvedVenues = artist.venues.map(venueId => {
        const resolvedId = resolveVenueId(venueId);
        if (resolvedId !== venueId) {
          console.log(`  Resolving ${venueId} -> ${resolvedId} for artist "${artist.name}"`);
          totalResolutions++;
          artistHadChanges = true;
        }
        return resolvedId;
      });
      
      if (artistHadChanges) {
        artist.venues = resolvedVenues;
        affectedArtists++;
      }
    }
  }
  
  console.log(`Total venue ID resolutions: ${totalResolutions}`);
  console.log(`Artists affected: ${affectedArtists}`);
  
  if (totalResolutions > 0) {
    console.log("Writing updated artists data...");
    await writeFile("./src/data/artists.json", JSON.stringify(artistsData, null, 2));
    console.log("Artists data updated successfully!");
  } else {
    console.log("No venue ID resolutions needed.");
  }
}

fixVenueReferencesInArtists().catch(console.error);