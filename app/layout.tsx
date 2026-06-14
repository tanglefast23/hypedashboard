import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HYPE Dashboard",
  description: "Live HYPE token and Hyperliquid ecosystem dashboard.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
