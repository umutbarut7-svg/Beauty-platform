import type { ReactNode } from "react";
import "./styles.css";
import { siteMetadata } from "./metadata";

export const metadata = siteMetadata;

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
