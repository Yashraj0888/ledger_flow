import type { Metadata, Viewport } from "next";
import { DM_Mono, DM_Sans, Fraunces } from "next/font/google";
import { Toaster } from "sonner";
import { AuthProvider } from "@/components/AuthProvider";
import { ScrollbarReveal } from "@/components/ScrollbarReveal";
import "./globals.css";

// latin-ext is needed for the rupee sign (U+20B9).
const body = DM_Sans({
  variable: "--font-body",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const heading = Fraunces({
  variable: "--font-heading",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const mono = DM_Mono({
  variable: "--font-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "LedgerFlow", template: "%s · LedgerFlow" },
  description: "A secure personal ledger: accounts, transactions and transfers.",
};

export const viewport: Viewport = {
  themeColor: "#f6efe3",
  colorScheme: "light",
};

// Warm toast palette (sonner reads these CSS variables).
const toastTheme = {
  "--normal-bg": "#fffaf1",
  "--normal-text": "#2b2118",
  "--normal-border": "#d6c6ab",
  "--success-bg": "#e9f0db",
  "--success-text": "#2f5229",
  "--success-border": "#bccaa2",
  "--error-bg": "#f9e3db",
  "--error-text": "#8a2f20",
  "--error-border": "#e6bcae",
  "--warning-bg": "#f8ecd2",
  "--warning-text": "#7a5410",
  "--warning-border": "#e5cf9c",
  "--info-bg": "#f1e3cb",
  "--info-text": "#5a4128",
  "--info-border": "#dcc9a5",
} as React.CSSProperties;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${heading.variable} ${mono.variable}`}>
      <body>
        <AuthProvider>{children}</AuthProvider>
        <ScrollbarReveal />
        <Toaster
          position="top-right"
          richColors
          closeButton
          theme="light"
          style={toastTheme}
          toastOptions={{ style: { borderRadius: 14, fontFamily: "var(--font-sans)" } }}
        />
      </body>
    </html>
  );
}
