import type { Metadata, Viewport } from "next";
import { Figtree, JetBrains_Mono, Literata } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import { TopBar } from "@/components/TopBar";

const ui = Figtree({ subsets: ["latin"], variable: "--font-ui", weight: ["400", "500", "600"] });
const read = Literata({ subsets: ["latin"], variable: "--font-read", weight: ["400", "500"], style: ["normal", "italic"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://mullwell.xanom.co"),
  title: "Mullwell",
  description: "An all-in-one study app: turn your class notes, PDFs and lectures into practice that sticks, with spaced review and test prep, using your own ChatGPT or Grok subscription.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f3ec" },
    { media: "(prefers-color-scheme: dark)", color: "#171614" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${ui.variable} ${read.variable} ${mono.variable}`}>
      <body>
        <TopBar />
        {children}
      </body>
    </html>
  );
}
