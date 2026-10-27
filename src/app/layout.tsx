import type { Metadata } from "next";
import { CursorEffect } from "@/components/cursor-effect";
import "./globals.css";

export const metadata: Metadata = {
  title: "ctrl_z | Cybersecurity Investigation",
  description:
    "A story-driven, team-based cybersecurity competition platform.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <CursorEffect />
        {children}
      </body>
    </html>
  );
}
