import type { Metadata } from "next";
import { Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";
import "../app/globals.css";

const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"], weight: ["300","400","500","600","700"],
  variable: "--font-noto-sans-sc", display: "swap",
});

const notoSerifSC = Noto_Serif_SC({
  subsets: ["latin"], weight: ["400","500","600","700"],
  variable: "--font-noto-serif-sc", display: "swap",
});

export const metadata: Metadata = {
  title: "忆见", description: "AI 情绪陪伴平台",
  manifest: "/manifest.json",
  icons: { icon:"/icon-192.png", apple:"/icon-512.png" },
  appleWebApp: { capable:true, statusBarStyle:"black-translucent", title:"忆见" },
};

export const viewport = { width:"device-width", initialScale:1, maximumScale:1, themeColor:"#0B0A08" };

export default function RootLayout({ children }:{ children:React.ReactNode }) {
  return (
    <html lang="zh-CN" style={{colorScheme:"dark"}}>
      <body className={`${notoSansSC.variable} ${notoSerifSC.variable} antialiased`}
        style={{margin:0,padding:0,background:"var(--bg-deep,#0B0A08)",fontFamily:"var(--font-sans)"}}>
        {children}
      </body>
    </html>
  );
}
