import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { AuthProvider } from "@/components/providers/auth-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ABM",
  description: "ABM Workshop & Fleet Management",
  icons: {
    icon: "https://res.cloudinary.com/dyg7neetr/image/upload/v1772036824/ABM_BLACK_g6i4dm.png",
    shortcut: "https://res.cloudinary.com/dyg7neetr/image/upload/v1772036824/ABM_BLACK_g6i4dm.png",
    apple: "https://res.cloudinary.com/dyg7neetr/image/upload/v1772036824/ABM_BLACK_g6i4dm.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          {children}
          <Toaster position="top-right" richColors closeButton />
        </AuthProvider>
      </body>
    </html>
  );
}
