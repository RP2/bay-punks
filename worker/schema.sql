CREATE TABLE IF NOT EXISTS artists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  spotify_url TEXT,
  genres TEXT,
  aliases TEXT,
  spotify_followers INTEGER,
  spotify_popularity INTEGER,
  spotify_image_url TEXT,
  spotify_data TEXT,
  searchUrl TEXT,
  firstSeen TEXT,
  lastSeen TEXT
);

CREATE TABLE IF NOT EXISTS venues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  aliases TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  venue_id TEXT NOT NULL,
  extra TEXT,
  source TEXT,
  source_url TEXT
);

CREATE TABLE IF NOT EXISTS event_artists (
  event_id TEXT NOT NULL,
  artist_id TEXT NOT NULL,
  billing_order INTEGER,
  PRIMARY KEY (event_id, artist_id)
);
