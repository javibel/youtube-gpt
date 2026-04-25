import type { Metadata } from "next";
import SessionProviderWrapper from "@/components/SessionProviderWrapper";
import ChatWidget from "@/components/ChatWidget";
import "./globals.css";

const BASE_URL = "https://ytubviral.com";

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
    title: "YTubViral — Genera contenido viral para YouTube con IA",
    description:
      "Títulos, descripciones, scripts y miniaturas para YouTube generados por IA en segundos.",
    images: ["/og-image.png"],
  },
  alternates: {
    canonical: BASE_URL,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "YTubViral",
              "url": "https://ytubviral.com",
              "applicationCategory": "BusinessApplication",
              "operatingSystem": "Web",
              "description": "Herramienta de IA para YouTubers. Genera títulos virales, scripts, descripciones SEO, captions, miniaturas, keyword research y análisis de competidores en segundos.",
              "offers": [
                {
                  "@type": "Offer",
                  "name": "Free",
                  "price": "0",
                  "priceCurrency": "EUR",
                  "description": "10 generaciones al mes, sin tarjeta de crédito"
                },
                {
                  "@type": "Offer",
                  "name": "Pro",
                  "price": "9.99",
                  "priceCurrency": "EUR",
                  "description": "200 generaciones al mes, todas las herramientas"
                }
              ],
              "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": "4.8",
                "reviewCount": "127"
              },
              "creator": {
                "@type": "Organization",
                "name": "YTubViral",
                "url": "https://ytubviral.com"
              }
            })
          }}
        />
      </head>
      <body>
        <SessionProviderWrapper>
          {children}
          <ChatWidget />
        </SessionProviderWrapper>
      </body>
    </html>
  );
}