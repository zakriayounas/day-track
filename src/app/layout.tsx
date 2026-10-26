import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DayTrack — Team workspace",
  description: "A calm, lightweight workspace for your team's tasks, notes, and releases.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
