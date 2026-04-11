import { clsx, type ClassValue } from "clsx";
import type { DateTime } from "surrealdb";
import { twMerge } from "tailwind-merge";
import { localeStore } from "./stores";
import { get } from "svelte/store";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, "child"> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, "children"> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };

export function formatDate(date?: DateTime | string, withTime: boolean = false): string {
	if (!date) return '-';
	const nativeDate = typeof date === 'string' ? new Date(date) : date.toDate();
	const locale = get(localeStore);
	if (withTime) {
		return new Intl.DateTimeFormat(locale, {
			year: 'numeric',
			month: 'short',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		}).format(nativeDate);
	} else {
		return new Intl.DateTimeFormat(locale, {
			year: 'numeric',
			month: 'short',
			day: '2-digit'
		}).format(nativeDate);
	}
}