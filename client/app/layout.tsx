import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WasmProvider } from "@/context/WasmContext";
import WasmGate from "@/components/ui/WasmGate";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Catch the King AI",
  description: "App to provide AI suggestions for Catch the King game.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <WasmProvider>
          <WasmGate>
            {children}
          </WasmGate>
        </WasmProvider>
      </body>
    </html>
  );
}
