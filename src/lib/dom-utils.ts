/**
 * DOM utility functions for client-side operations
 */

/**
 * Filter DOM elements based on a search query
 * @param elements - NodeList of elements to filter
 * @param query - Search query to filter by
 * @param countElement - Optional element to update with the count of visible items
 * @returns Array of matching elements
 */
export function filterDOMElementsByText(
  elements: NodeListOf<Element>,
  query: string,
  countElement?: HTMLElement,
): Element[] {
  if (!query) {
    // If query is empty, show all elements
    Array.from(elements).forEach((element) => {
      (element as HTMLElement).style.display = "";
    });

    // Update count
    if (countElement) {
      countElement.textContent = elements.length.toString();
    }

    return Array.from(elements);
  }

  // Filter elements based on query
  const filteredElements = Array.from(elements).filter((element) => {
    // Get content of the element
    const content = element.textContent?.toLowerCase() || "";
    const matches = content.includes(query.toLowerCase());

    // Show or hide element based on match
    (element as HTMLElement).style.display = matches ? "" : "none";

    return matches;
  });

  // Update count
  if (countElement) {
    countElement.textContent = filteredElements.length.toString();
  }

  return filteredElements;
}

/**
 * Type definition for day object
 */
interface DayObject {
  normalizedDate: string;
  events: any[];
  [key: string]: any;
}

/**
 * Sort DOM elements by day data
 * @param elements - Array of elements with data-day-id attributes
 * @param showsData - Calendar data with shows information
 * @param sortType - Sort type ("chronological", "reverse-chronological", "frequency")
 * @param container - Container element to append sorted elements to
 * @param filterDate - Date to filter by, usually today's date
 */
export function sortDayElements(
  elements: Element[],
  showsData: { shows: DayObject[] },
  sortType: string,
  container: HTMLElement,
  filterDate: string,
): void {
  // Create a map of elements by their day IDs
  const elementMap = new Map(
    elements.map((element) => {
      const dayId = element.getAttribute("data-day-id");
      return [dayId, element];
    }),
  );

  // Filter and sort the shows data
  let sortedShows: DayObject[];

  if (sortType === "chronological") {
    sortedShows = showsData.shows
      .filter((day: DayObject) => day.normalizedDate >= filterDate)
      .sort((a: DayObject, b: DayObject) =>
        a.normalizedDate.localeCompare(b.normalizedDate),
      );
  } else if (sortType === "reverse-chronological") {
    sortedShows = showsData.shows
      .filter((day: DayObject) => day.normalizedDate >= filterDate)
      .sort((a: DayObject, b: DayObject) =>
        b.normalizedDate.localeCompare(a.normalizedDate),
      );
  } else if (sortType === "frequency") {
    sortedShows = showsData.shows
      .filter((day: DayObject) => day.normalizedDate >= filterDate)
      .sort((a: DayObject, b: DayObject) => b.events.length - a.events.length);
  } else {
    // Default to chronological
    sortedShows = showsData.shows
      .filter((day: DayObject) => day.normalizedDate >= filterDate)
      .sort((a: DayObject, b: DayObject) =>
        a.normalizedDate.localeCompare(b.normalizedDate),
      );
  }

  // Reorder elements in the DOM
  sortedShows.forEach((day: DayObject) => {
    const element = elementMap.get(day.normalizedDate);
    if (element) {
      container.appendChild(element);
    }
  });
}

/**
 * Safely parse JSON from a DOM element's content
 * @param element - Element containing JSON content
 * @param defaultValue - Default value to return if parsing fails
 * @returns Parsed JSON or default value
 */
export function parseJSONFromElement<T>(
  element: HTMLElement | null,
  defaultValue: T,
): T {
  if (!element || !element.textContent) {
    return defaultValue;
  }

  try {
    return JSON.parse(element.textContent);
  } catch (error) {
    console.error("Error parsing JSON:", error);
    return defaultValue;
  }
}
