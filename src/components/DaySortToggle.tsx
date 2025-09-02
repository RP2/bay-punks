import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  CalendarClockIcon,
  ChevronDownIcon,
  ListOrderedIcon,
} from "lucide-react";

export function DaySortToggle({ className }: { className?: string }) {
  const [sortType, setSortType] = useState<string>("chronological");

  const handleSortChange = (sortType: string) => {
    setSortType(sortType);

    // Call the global sort function if it exists
    if (window.handleDaySortChange) {
      window.handleDaySortChange(sortType);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn("flex items-center gap-2 py-6", className)}
        >
          {sortType === "chronological" ? (
            <>
              <CalendarClockIcon size={16} />
              <span>Date (Soonest)</span>
            </>
          ) : sortType === "reverse-chronological" ? (
            <>
              <CalendarClockIcon size={16} className="rotate-180" />
              <span>Date (Latest)</span>
            </>
          ) : (
            <>
              <ListOrderedIcon size={16} />
              <span>Number of Shows</span>
            </>
          )}
          <ChevronDownIcon size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => handleSortChange("chronological")}>
            <CalendarClockIcon size={16} className="mr-2" />
            <span>Date (Soonest)</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleSortChange("reverse-chronological")}
          >
            <CalendarClockIcon size={16} className="mr-2 rotate-180" />
            <span>Date (Latest)</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleSortChange("frequency")}>
            <ListOrderedIcon size={16} className="mr-2" />
            <span>Number of Shows</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Declare global window interface to include our custom function
declare global {
  interface Window {
    handleDaySortChange?: (sortType: string) => void;
  }
}
