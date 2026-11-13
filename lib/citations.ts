/*
 * APA 7th edition reference entries, as plain text so they paste anywhere.
 * Used on the server and in the browser, so no server-only imports here.
 * Good enough for a lesson's reading list; teachers should still check them.
 */

export type Citable = {
  url: string;
  title: string;
  site: string;
  savedAt: string;
  kind: string | null;
  authors: string[];
  published: string | null;
  doi: string | null;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const HONORIFICS = /^(dr|prof|professor|mr|mrs|ms|mx|sir|dame)\.?\s+/i;

/** "Dr. Maya Chen" -> "Chen, M." ; "Ana María Ruiz" -> "Ruiz, A. M." */
export function apaName(fullName: string): string {
  const name = fullName.replace(HONORIFICS, "").trim();
  if (name.includes(",")) return name;
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name;
  const last = parts.pop() as string;
  return `${last}, ${parts.map((p) => `${p[0].toUpperCase()}.`).join(" ")}`;
}

function apaAuthors(authors: string[]): string {
  const names = authors.map(apaName);
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= 20) return `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
  return `${names.slice(0, 19).join(", ")}, ... ${names[names.length - 1]}`;
}

/** "2026-11-03" -> "2026, November 3"; "2020" -> "2020"; null -> "n.d." */
export function apaDate(value: string | null): string {
  if (!value) return "n.d.";
  const [year, month, day] = value.split("-").map(Number);
  if (!year) return "n.d.";
  if (!month) return String(year);
  if (!day) return `${year}, ${MONTHS[month - 1]}`;
  return `${year}, ${MONTHS[month - 1]} ${day}`;
}

function retrievedOn(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

const sentence = (s: string) => (/[.?!]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

const isWiki = (s: Citable) => /wiki(pedia|books|versity)/i.test(s.site) && /\/wiki\//.test(s.url);

export function apaCitation(source: Citable): string {
  const title = sentence(source.title);
  const date = apaDate(source.published);
  const link = source.doi || source.url;

  // Photosynthesis. (2026, November 3). In Wikipedia. https://en.wikipedia.org/wiki/Photosynthesis
  if (isWiki(source)) return `${title} (${date}). In ${source.site}. ${source.url}`;

  const authors = apaAuthors(source.authors);
  const publisher = source.site && !authors.includes(source.site) ? ` ${sentence(source.site)}` : "";
  // Undated pages can change, so APA asks for the date you read them.
  const retrieved = source.published ? "" : `Retrieved ${retrievedOn(source.savedAt)}, from `;

  if (authors) return `${sentence(authors)} (${date}). ${title}${publisher} ${retrieved}${link}`;
  return `${title} (${date}).${publisher} ${retrieved}${link}`;
}
