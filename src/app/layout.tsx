import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "@/components/navbar";
import { EVENT, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Metadatos del sitio.
 *
 * La imagen para compartir (`og:image`) no se declara aquí: la genera
 * `src/app/opengraph-image.tsx` y Next añade las etiquetas `og:image` y
 * `twitter:image` con su URL absoluta (resuelta con `metadataBase`).
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: EVENT.description,
  applicationName: SITE_NAME,
  keywords: [
    "networking",
    "videojuegos",
    "estudios indie",
    "publishers",
    "evento",
    "reuniones 1 a 1",
  ],
  openGraph: {
    type: "website",
    locale: "es_CL",
    url: "/",
    siteName: SITE_TITLE,
    title: SITE_TITLE,
    description: EVENT.description,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: EVENT.description,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
