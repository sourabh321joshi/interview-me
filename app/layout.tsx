import "./globals.css";

export const metadata = {
  title: "Interview Me",
  description: "AI mock interviews for developers, built around your projects.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
