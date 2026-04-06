import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verbex AI — AI Agent Platform",
  description: "Create and deploy AI chatbot agents on any website",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
