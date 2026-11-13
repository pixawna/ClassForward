import { Atkinson_Hyperlegible_Next, Literata, Schoolbell } from "next/font/google";

// Literata: a book face, for headlines that read like the first line of a story.
export const literata = Literata({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-literata",
  display: "swap",
});

// Atkinson Hyperlegible Next: built for readability, for body copy.
export const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  variable: "--font-atkinson",
  display: "swap",
});

// Schoolbell: chalk on the board and the teacher's red pen.
export const schoolbell = Schoolbell({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-schoolbell",
  display: "swap",
});
