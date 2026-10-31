import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ngapaya — Marketing HBI",
  description: "Workspace manajemen tim dan analitik sosial media HBI",
  icons: { icon: "/brand/ngapaya-logo.png", apple: "/brand/ngapaya-logo.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f9fa" },
    { media: "(prefers-color-scheme: dark)", color: "#111214" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
