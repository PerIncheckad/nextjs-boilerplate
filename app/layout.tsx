import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Incheckad" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>
        {children}
      </body>
    </html>
  );
}
