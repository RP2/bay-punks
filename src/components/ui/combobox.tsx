import * as React from "react";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import artistsData from "@/data/artists.json";

// extract unique genres from artist data
function getUniqueGenres(): string[] {
  const genreSet = new Set<string>();
  for (const artist of artistsData.artists) {
    if (artist.spotifyData && Array.isArray(artist.spotifyData.genres)) {
      for (const genre of artist.spotifyData.genres) {
        genreSet.add(genre);
      }
    }
  }
  return Array.from(genreSet).sort((a, b) => a.localeCompare(b));
}

interface GenreComboboxProps {
  className?: string;
}

export function GenreCombobox({ className }: GenreComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<string>("");
  const [sortedGenres, setSortedGenres] = React.useState<string[]>([]);
  const genres = React.useMemo(() => getUniqueGenres(), []);
  const listRef = React.useRef<HTMLDivElement>(null);

  // sync with window.selectedGenre if present
  React.useEffect(() => {
    if (typeof window !== "undefined" && window.selectedGenre !== undefined) {
      setSelected(window.selectedGenre || "");
    }
  }, []);

  // when dropdown opens, move selected genre to top if present
  React.useEffect(() => {
    if (open) {
      if (selected && genres.includes(selected)) {
        setSortedGenres([selected, ...genres.filter((g) => g !== selected)]);
      } else {
        setSortedGenres(genres);
      }
    }
  }, [open, selected, genres]);

  function handleSelect(currentValue: string) {
    setOpen(false);
    const newValue = currentValue === selected ? "" : currentValue;
    setSelected(newValue);
    if (typeof window !== "undefined" && window.handleArtistGenreChange) {
      window.handleArtistGenreChange(newValue);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "min-h-[44px] w-56 min-w-[140px] justify-between",
            className,
          )}
        >
          {selected ? selected : "Select genre..."}
          {/* use ChevronDown for visual consistency */}
          <svg
            className="ml-2 h-4 w-4 shrink-0 opacity-50"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0">
        <Command>
          <CommandInput placeholder="Search genre..." />
          <CommandList ref={listRef}>
            <CommandEmpty>No genre found.</CommandEmpty>
            <CommandGroup>
              {(open ? sortedGenres : genres).map((genre) => (
                <CommandItem
                  key={genre}
                  value={genre}
                  data-genre-item={genre}
                  onSelect={() => handleSelect(genre)}
                >
                  <CheckIcon
                    className={cn(
                      "mr-2 h-4 w-4",
                      selected === genre ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {genre}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// add window type declaration for genre handler and selectedGenre
declare global {
  interface Window {
    handleArtistGenreChange?: (genre: string) => void;
    selectedGenre?: string;
  }
}

export { GenreCombobox as Combobox };
