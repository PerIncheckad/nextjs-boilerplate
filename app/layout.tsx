import "./globals.css";
import type { Metadata } from "next";
import AppAuthBoundary from "@/components/AppAuthBoundary";

export const metadata: Metadata = { title: "Incheckad" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>
        <AppAuthBoundary>{children}</AppAuthBoundary>
      </body>
    </html>
  );
}
