import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { POSITION_LABELS } from "./constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a date string (YYYY-MM-DD) as a local date without timezone shifting.
 * This prevents dates from appearing as the previous day due to UTC conversion.
 */
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format a date to YYYY-MM-DD string for database storage
 */
export function formatDateForDB(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get the weekend pair (Saturday and Sunday) for a given date.
 * Returns the Saturday date string of that weekend.
 */
export function getWeekendKey(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  
  if (day === 0) {
    // Sunday - get the previous Saturday
    const saturday = new Date(date);
    saturday.setDate(date.getDate() - 1);
    return formatDateForDB(saturday);
  } else if (day === 6) {
    // Saturday - use this date
    return dateStr;
  }
  // Not a weekend - return as is
  return dateStr;
}

/**
 * Check if a date is a weekend (Saturday or Sunday)
 */
export function isWeekend(dateStr: string): boolean {
  const date = parseLocalDate(dateStr);
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Get the other day of the weekend pair
 */
export function getWeekendPairDate(dateStr: string): string | null {
  const date = parseLocalDate(dateStr);
  const day = date.getDay();
  
  if (day === 6) {
    // Saturday - return Sunday
    const sunday = new Date(date);
    sunday.setDate(date.getDate() + 1);
    return formatDateForDB(sunday);
  } else if (day === 0) {
    // Sunday - return Saturday
    const saturday = new Date(date);
    saturday.setDate(date.getDate() - 1);
    return formatDateForDB(saturday);
  }
  return null;
}

export interface WeekendGroup<T> {
  weekendKey: string;
  saturdayDate: string;
  sundayDate: string;
  items: T[];
}

/**
 * Group scheduled dates by weekend. 
 * Weekend dates (Sat/Sun) are grouped together, non-weekend dates remain individual.
 */
export function groupByWeekend<T extends { scheduleDate: string }>(
  dates: T[]
): WeekendGroup<T>[] {
  const groups: Map<string, WeekendGroup<T>> = new Map();
  
  for (const item of dates) {
    if (isWeekend(item.scheduleDate)) {
      const key = getWeekendKey(item.scheduleDate);
      const satDate = parseLocalDate(key);
      const sunDate = new Date(satDate);
      sunDate.setDate(satDate.getDate() + 1);
      
      if (!groups.has(key)) {
        groups.set(key, {
          weekendKey: key,
          saturdayDate: key,
          sundayDate: formatDateForDB(sunDate),
          items: [],
        });
      }
      groups.get(key)!.items.push(item);
    } else {
      // Non-weekend - create individual group
      groups.set(item.scheduleDate, {
        weekendKey: item.scheduleDate,
        saturdayDate: item.scheduleDate,
        sundayDate: item.scheduleDate,
        items: [item],
      });
    }
  }
  
  // Sort by date
  return Array.from(groups.values()).sort(
    (a, b) => parseLocalDate(a.weekendKey).getTime() - parseLocalDate(b.weekendKey).getTime()
  );
}

/**
 * Format a team position enum value to a human-readable label
 * Uses POSITION_LABELS from constants for consistency across the app
 */
export function formatPositionLabel(position: string): string {
  return POSITION_LABELS[position] || position.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Priority order for positions when displaying a member's primary role
 * Vocalist takes priority, then other instrument positions
 */
const POSITION_PRIORITY: string[] = [
  'vocalist',
  'keys',
  'drums',
  'bass',
  'electric_guitar',
  'electric_1',
  'electric_2',
  'acoustic_guitar',
  'acoustic_1',
  'acoustic_2',
  'piano',
];

/**
 * Sort positions by priority (vocalist first, then instruments)
 */
export function sortPositionsByPriority(positions: string[]): string[] {
  return [...positions].sort((a, b) => {
    const aIndex = POSITION_PRIORITY.indexOf(a);
    const bIndex = POSITION_PRIORITY.indexOf(b);
    // If both are in priority list, sort by index
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    // If only one is in priority list, it comes first
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    // Otherwise alphabetical
    return a.localeCompare(b);
  });
}

/**
 * Get the primary (highest priority) position for a member
 */
export function getPrimaryPosition(positions: string[]): string | null {
  if (positions.length === 0) return null;
  return sortPositionsByPriority(positions)[0];
}
