import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AuthGate } from "@/components/auth-gate";

import "./carbon.scss";
import "./globals.css";

export const metadata: Metadata = {
  title: "Event Attendance | tech@nyu",
  description: "Reconcile Luma and NYU Engage attendance exports.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
