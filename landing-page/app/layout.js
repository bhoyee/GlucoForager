import "./globals.css";
import SystemLogger from "../components/SystemLogger";
import CookieBanner from "../components/CookieBanner";

export const metadata = {
  title: {
    default: "GlucoForager | Daily Diabetes Food Assistant",
    template: "%s | GlucoForager",
  },
  description:
    "Stop guessing what to eat with diabetes. Scan ingredients or type what you have to get blood-sugar-friendly meal ideas, food swaps, and a daily meal plan.",
  applicationName: "GlucoForager",
  keywords: [
    "diabetes food assistant",
    "what to eat with diabetes",
    "blood sugar meal ideas",
    "diabetes meal planner",
    "daily meal plan",
    "food swaps",
    "carb swaps",
    "Type 2 Diabetes app",
    "ingredient scanner app",
    "scan ingredients",
    "low carb meal ideas",
    "glucose-friendly meals",
  ],
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.glucoforager.com"),
  openGraph: {
    title: "GlucoForager - Daily Diabetes Food Assistant",
    description:
      "Stop guessing what to eat. Scan ingredients or type what you have - get smarter meal ideas, better swaps, and a daily meal plan.",
    url: process.env.NEXT_PUBLIC_SITE_URL || "https://www.glucoforager.com",
    siteName: "GlucoForager",
    locale: "en_GB",
    type: "website",
    images: [
      { url: "/opengraph-image.png", width: 1200, height: 630, alt: "GlucoForager" },
      { url: "/images/logo.png", width: 512, height: 512, alt: "GlucoForager Logo" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "GlucoForager - Daily Diabetes Food Assistant",
    description:
      "Stop guessing what to eat. Scan ingredients or type what you have - get smarter meal ideas, better swaps, and a daily meal plan.",
    images: ["/twitter-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: "/images/favicon.ico",
    shortcut: "/images/favicon.ico",
    apple: "/images/logo.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.glucoforager.com").replace(/\/+$/, "");
  const appStoreUrl = "https://apps.apple.com/us/app/glucoforager/id6758808427";
  const playStoreUrl = "https://play.google.com/store/apps/details?id=com.glucoforager.app";
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "GlucoForager",
        url: siteUrl,
        logo: `${siteUrl}/images/logo.png`,
      },
      {
        "@type": "WebSite",
        name: "GlucoForager",
        url: siteUrl,
      },
      {
        "@type": "MobileApplication",
        name: "GlucoForager",
        applicationCategory: "HealthApplication",
        operatingSystem: "iOS, Android",
        url: siteUrl,
        downloadUrl: [appStoreUrl, playStoreUrl],
        description:
          "GlucoForager is a daily diabetes food assistant that helps you decide what to eat without guessing. Scan ingredients or type what you have to get meal ideas, food swaps, and a daily meal plan.",
      },
    ],
  };

  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/images/favicon.ico" />
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="antialiased">
        <SystemLogger />
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
