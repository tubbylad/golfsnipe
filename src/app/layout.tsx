import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GolfSnipe",
  description: "Auto-books your recurring BRS Golf tee time the moment the sheet is released.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
