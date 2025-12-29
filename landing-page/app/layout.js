import "./globals.css";

export const metadata = {
  title: "GlucoForager | Diabetes-friendly recipes",
  description: "Diabetes-friendly dinners from your fridge in 60 seconds.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-midnight text-slate-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
