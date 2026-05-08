import "./globals.css";

export const metadata = {
  title: "VMS - Venue Inventory Master",
  description: "Venue Management System - DEXIT Global",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
