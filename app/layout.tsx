import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import SessionProviderWrapper from "@/components/SessionProviderWrapper";
import { LangProvider } from "@/components/LangProvider";
import DeferredChatWidget from "@/components/DeferredChatWidget";
import PageViewTracker from "@/components/PageViewTracker";
import UTMCapture from "@/components/UTMCapture";
import CookieConsent from "@/components/CookieConsent";
import Toaster from "@/components/Toaster";
import "./globals.css";

const BASE_URL = "https://ytubviral.com";

// Fuentes self-hosted via next/font (A2): elimina el CSS render-blocking de
// fonts.googleapis.com y la transferencia de IP a Google (RGPD). next/font
// añade size-adjust automático al fallback → menos CLS por font-swap.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-inter", display: "swap" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-space-grotesk", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-mono-jb", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "YTubViral — Genera contenido viral para YouTube con IA",
    template: "%s | YTubViral",
  },
  description:
    "Genera títulos virales, descripciones SEO, scripts, captions y conceptos de miniaturas para YouTube en segundos con inteligencia artificial. Prueba gratis.",
  keywords: [
    "generador contenido youtube",
    "títulos virales youtube",
    "IA para youtubers",
    "herramienta youtube ia",
    "crear contenido youtube",
    "descripciones seo youtube",
    "script youtube ia",
    "miniaturas youtube",
    "captions redes sociales",
    "keyword research youtube",
    "analizar competidores youtube",
    "herramienta keyword youtube",
    "ytubviral",
  ],
  authors: [{ name: "YTubViral", url: BASE_URL }],
  creator: "YTubViral",
  publisher: "YTubViral",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    type: "website",
    locale: "es_ES",
    url: BASE_URL,
    siteName: "YTubViral",
    title: "YTubViral — Genera contenido viral para YouTube con IA",
    description:
      "Títulos, descripciones, scripts y miniaturas para YouTube generados por IA en segundos. Empieza gratis.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "YTubViral — Genera contenido viral para YouTube con IA",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@ytubviral",
    creator: "@ytubviral",
    title: "YTubViral — Genera contenido viral para YouTube con IA",
    description:
      "Títulos, descripciones, scripts y miniaturas para YouTube generados por IA en segundos.",
  },
  // NO alternates here: a root-layout canonical is inherited by every page
  // without its own, marking them as duplicates of the homepage for Google.
  // Each page declares its own canonical (homepage's lives in app/page.tsx).
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Default to 'es' on server — LangProvider hydrates the actual preference client-side.
  // This keeps ALL pages statically cacheable (no cookies() call = no forced dynamic rendering).
  const lang = 'es' as const;

  return (
    <html lang={lang} className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="YTubViral" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
        <LangProvider lang={lang as 'es' | 'en'}>
          <SessionProviderWrapper>
            {children}
            <DeferredChatWidget />
            <PageViewTracker />
            <Suspense fallback={null}><UTMCapture /></Suspense>
            <CookieConsent />
            <Toaster />
          </SessionProviderWrapper>
        </LangProvider>
      </body>
    </html>
  );
}