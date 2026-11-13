import type { Metadata } from "next";
import { atkinson, literata, schoolbell } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClassForward: turn every lesson into a story",
  description: "Story-driven lessons, shareable study notes, and classroom quizzes.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${literata.variable} ${atkinson.variable} ${schoolbell.variable}`}>
      <body>{children}</body>
    </html>
  );
}
