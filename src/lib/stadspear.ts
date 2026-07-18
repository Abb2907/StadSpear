// Shared client/server constants for StadSpear.

export const STADIUMS = [
  { id: "MetLife", name: "MetLife Stadium", city: "New York / New Jersey" },
  { id: "SoFi", name: "SoFi Stadium", city: "Los Angeles" },
  { id: "AT&T", name: "AT&T Stadium", city: "Dallas" },
  { id: "Azteca", name: "Estadio Azteca", city: "Mexico City" },
  { id: "BMO", name: "BMO Field", city: "Toronto" },
] as const;

export const ROLES = [
  { id: "fan", label: "Fan", description: "Match-day navigation & concierge" },
  { id: "volunteer", label: "Volunteer", description: "Shift briefings & guest assistance" },
  { id: "ops", label: "Ops staff", description: "Crowd, transit, and safety intelligence" },
] as const;

export const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
  { id: "fr", label: "Français" },
  { id: "pt", label: "Português" },
  { id: "ar", label: "العربية" },
  { id: "ja", label: "日本語" },
  { id: "hi", label: "हिन्दी" },
  { id: "de", label: "Deutsch" },
] as const;

export type RoleId = (typeof ROLES)[number]["id"];
export type LanguageId = (typeof LANGUAGES)[number]["id"];

export const DEFAULT_MODEL = "google/gemini-2.5-flash";
