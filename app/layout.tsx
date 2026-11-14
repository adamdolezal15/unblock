import type { Metadata } from "next";
import { Overpass, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// Overpass: after the Highway Gothic road-sign lettering, for the whole UI and the headlines. The plan
// reads like wayfinding, so its type does too.
const overpass = Overpass({
  variable: "--font-overpass",
  subsets: ["latin", "latin-ext"],
  weight: "variable",
});

// Only for quoted source sentences, so citations read as documents.
const serif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Unblock",
  description: "Your move to Finland, untangled. Every step sourced.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${overpass.variable} ${serif.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
