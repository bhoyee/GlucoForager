import "./globals.css";

export const metadata = {
  title: "GlucoForager | AI-Powered Diabetes-Friendly Recipes",
  description: "Snap a photo of your fridge, get 3 diabetes-safe recipes instantly. AI-powered meal planning for Type 2 Diabetes.",
  keywords: "diabetes recipes, AI cooking, diabetes meal planner, Type 2 Diabetes app",
  //metadataBase: new URL('https://glucoforager.com'), // Add your actual domain here
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:5173'),
  openGraph: {
    title: "GlucoForager - Diabetes-Friendly Recipes in 60 Seconds",
    description: "AI-powered meal planning for Type 2 Diabetes. Snap your fridge, get safe recipes.",
    images: ['/images/logo.png'],
  },
  icons: {
    icon: '/images/favicon.ico',
    shortcut: '/images/favicon.ico',
    apple: '/images/logo.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/images/favicon.ico" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}