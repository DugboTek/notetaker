import type { Metadata } from "next";
import { Fraunces, Space_Grotesk } from "next/font/google";
import "./globals.css";

const body = Space_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
});

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Notetaker",
  description: "Record a meeting, get a transcript, summary, and action items.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${body.variable} ${display.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
