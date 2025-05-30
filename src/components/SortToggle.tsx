import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, ArrowUpDown } from "lucide-react";

// global type declaration
declare global {
  interface Window {
    handleVenueSortChange?: (sortKey: string) => void;
    handleArtistSortChange?: (sortKey: string) => void;
  }
}

export interface SortOption {
  key: string;
  label: string;
  description?: string;
}

interface SortToggleProps {
  options: SortOption[];
  defaultSortKey: string;
  onSortChange: (sortKey: string) => void;
  label?: string;
  className?: string;
}

// generic reusable sort toggle component
export function SortToggle({
  options,
  defaultSortKey,
  onSortChange,
  label = "Sort by",
  className = "",
}: SortToggleProps) {
  const [_selectedSort, setSelectedSort] = useState(defaultSortKey);

  const selectedOption = options.find((option) => option.key === _selectedSort);

  const handleSortChange = (sortKey: string) => {
    setSelectedSort(sortKey);
    onSortChange(sortKey);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={`min-w-[140px] justify-between ${className}`}
        >
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4" />
            <span className="hidden sm:inline">{label}:</span>
            <span className="truncate">{selectedOption?.label}</span>
          </div>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.key}
            onClick={() => handleSortChange(option.key)}
            className="flex flex-col items-start"
          >
            <div className="font-medium">{option.label}</div>
            {option.description && (
              <div className="text-muted-foreground text-xs">
                {option.description}
              </div>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// venue-specific component
export function VenueSortToggle({ className = "" }: { className?: string }) {
  const VENUE_SORT_OPTIONS: SortOption[] = [
    {
      key: "alphabetical",
      label: "A to Z",
      description: "Alphabetical order by name",
    },
    {
      key: "reverse-alphabetical",
      label: "Z to A",
      description: "Reverse alphabetical order",
    },
    {
      key: "show-count",
      label: "Most Shows",
      description: "Venues with most shows first",
    },
    {
      key: "next-show",
      label: "Next Show",
      description: "Venues with upcoming shows first",
    },
  ];

  const handleSortChange = (sortKey: string) => {
    // call global function if available
    if (typeof window !== "undefined" && window.handleVenueSortChange) {
      window.handleVenueSortChange(sortKey);
    }
  };

  return (
    <SortToggle
      options={VENUE_SORT_OPTIONS}
      defaultSortKey="next-show"
      onSortChange={handleSortChange}
      label="Sort venues by"
      className={className}
    />
  );
}

// artist-specific component
export function ArtistSortToggle({ className = "" }: { className?: string }) {
  const ARTIST_SORT_OPTIONS: SortOption[] = [
    {
      key: "alphabetical",
      label: "A to Z",
      description: "Alphabetical order by name",
    },
    {
      key: "reverse-alphabetical",
      label: "Z to A",
      description: "Reverse alphabetical order",
    },
    {
      key: "show-count",
      label: "Most Shows",
      description: "Artists with most shows first",
    },
    {
      key: "next-show",
      label: "Next Show",
      description: "Artists with upcoming shows first",
    },
  ];

  const handleSortChange = (sortKey: string) => {
    // call global function if available
    if (typeof window !== "undefined" && window.handleArtistSortChange) {
      window.handleArtistSortChange(sortKey);
    }
  };

  return (
    <SortToggle
      options={ARTIST_SORT_OPTIONS}
      defaultSortKey="next-show"
      onSortChange={handleSortChange}
      label="Sort artists by"
      className={className}
    />
  );
}
