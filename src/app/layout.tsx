import "./globals.css";

export const metadata = {
  title: "Dog Walk Recap",
  description: "Draw route, auto distance, auto weather, share recap.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, height: "100vh" }}>{children}</body>
    </html>
  );
}
