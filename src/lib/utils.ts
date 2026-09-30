import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' }).format(new Date(value));
}
export function durationLabel(minutes: number) {
  return minutes >= 60
    ? `${Math.floor(minutes / 60)} ч ${minutes % 60 ? `${minutes % 60} мин` : ''}`
    : `${minutes} мин`;
}
export function initials(first: string, last = '') {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase() || 'А';
}
