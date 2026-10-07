import type { Metadata } from "next";
import "./globals.css";
import "./modules.css";
export const metadata: Metadata = {
  title: "心动铃铛 · Heartbell",
  description: "从一次心动，到共同写下的未来。",
  icons: { icon: "/visuals/heartbell/app-icon.png" },
};
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="zh-CN"><body>{children}</body></html>; }
