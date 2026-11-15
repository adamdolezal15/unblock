import type { Metadata } from "next";
import { Fraunces, Inter, Source_Serif_4, Space_Grotesk } from "next/font/google";
import "./globals.css";

// Inter for body text; Space Grotesk for headings and the big date numbers.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  weight: "variable",
});
const grotesk = Space_Grotesk({
  variable: "--font-grotesk",
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

// The Journey design's headings and numbers. Not preloaded: Classic (the default) never uses it.
const fraunces = Fraunces({
  variable: "--font-fraunces-src",
  subsets: ["latin", "latin-ext"],
  weight: "variable",
  axes: ["opsz"],
  preload: false,
});

export const metadata: Metadata = {
  title: "Unblock",
  description: "Your move to Finland, untangled. Every step sourced.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${grotesk.variable} ${serif.variable} ${fraunces.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
