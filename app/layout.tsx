import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClassForward",
  description: "Story-driven lessons, shareable study notes, and classroom quizzes.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
