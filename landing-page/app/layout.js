import "./globals.css";
import SystemLogger from "../components/SystemLogger";
import CookieBanner from "../components/CookieBanner";

const SOCIAL_IMAGE_VERSION = "20260323";

export const metadata = {
  title: {
    default: "GlucoForager — Diabetes Food Scanner, Glucose Tracker & Meal Ideas",
    template: "%s | GlucoForager",
  },
  description:
    "Stop guessing what to eat with diabetes. Scan any food or barcode for an instant diabetes-friendly verdict, log your glucose and carbs, and get meal ideas built around your goals. Free on iOS & Android.",
  applicationName: "GlucoForager",
  keywords: [
    "diabetes food scanner",
    "blood sugar tracker",
    "glucose tracker app",
    "barcode scanner diabetic",
    "carb counter app",
    "diabetes food assistant",
    "what to eat with diabetes",
    "diabetes meal planner",
    "food swaps",
    "carb swaps",
    "Type 2 Diabetes app",
    "ingredient scanner app",
    "glucose-friendly meals",
  ],
  metadataBase: new URL("https://www.glucoforager.com"),
  openGraph: {
    title: "GlucoForager — Diabetes Food Scanner, Glucose Tracker & Meal Ideas",
    description:
      "Stop guessing what to eat with diabetes. Scan any food or barcode for an instant diabetes-friendly verdict, log your glucose and carbs, and get meal ideas built around your goals. Free on iOS & Android.",
    url: "https://www.glucoforager.com",
    siteName: "GlucoForager",
    locale: "en_GB",
    type: "website",
    images: [
      {
        url: `/opengraph-image.png?v=${SOCIAL_IMAGE_VERSION}`,
        width: 1200,
        height: 630,
        alt: "GlucoForager",
      },
      { url: "/images/logo.png", width: 512, height: 512, alt: "GlucoForager Logo" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "GlucoForager — Diabetes Food Scanner, Glucose Tracker & Meal Ideas",
    description:
      "Stop guessing what to eat with diabetes. Scan any food or barcode for an instant diabetes-friendly verdict, log your glucose and carbs, and get meal ideas built around your goals. Free on iOS & Android.",
    images: [`/twitter-image.png?v=${SOCIAL_IMAGE_VERSION}`],
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
  const siteUrl = "https://www.glucoforager.com";
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
          "GlucoForager is a daily diabetes food assistant that helps you decide what to eat without guessing. Scan any food or barcode for a diabetes-friendly verdict, log glucose and carbs, and get meal ideas, food swaps, and a daily meal plan.",
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
