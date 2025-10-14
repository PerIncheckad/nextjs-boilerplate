import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Incheckad" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>
        {/* Denna div kommer nu att korrekt hanteras av globals.css för att visa bakgrundsbilden */}
        <div className="background-img" />
        {children}
      </body>
    </html>
  );
}
