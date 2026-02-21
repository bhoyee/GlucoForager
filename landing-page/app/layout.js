import "./globals.css";
import SystemLogger from "../components/SystemLogger";
import CookieBanner from "../components/CookieBanner";

export const metadata = {
  title: {
    default: "GlucoForager | AI-Powered Diabetes-Friendly Recipes",
    template: "%s | GlucoForager",
  },
  description:
    "Snap a photo of your fridge, get 3 diabetes-friendly recipes instantly. AI-powered meal planning for Type 2 Diabetes.",
  applicationName: "GlucoForager",
  keywords: ["diabetes recipes", "AI cooking", "diabetes meal planner", "Type 2 Diabetes app"],
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.glucoforager.com"),
  openGraph: {
    title: "GlucoForager - Diabetes-Friendly Recipes in 60 Seconds",
    description: "AI-powered meal planning for Type 2 Diabetes. Snap your fridge, get safe recipes.",
    url: "/",
    siteName: "GlucoForager",
    locale: "en_GB",
    type: "website",
    images: [{ url: "/images/logo.png", width: 512, height: 512, alt: "GlucoForager" }],
  },
  twitter: {
    card: "summary",
    title: "GlucoForager - Diabetes-Friendly Recipes in 60 Seconds",
    description: "AI-powered meal planning for Type 2 Diabetes. Snap your fridge, get safe recipes.",
    images: ["/images/logo.png"],
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
