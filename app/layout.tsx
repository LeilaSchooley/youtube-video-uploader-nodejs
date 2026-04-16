import { Inter } from "next/font/google";
import dynamic from "next/dynamic";
import "./globals.css";
import type { ReactNode } from "react";

const Providers = dynamic(() =>
  import("./providers").then((mod) => ({ default: mod.Providers })),
);

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata = {
  title: "ZonDiscounts Video Uploader",
  description: "Upload videos to YouTube with ease",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
