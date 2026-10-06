import type { Metadata } from "next";
import "./globals.css";
import "./modules.css";
export const metadata: Metadata = { title: "心动铃铛 · Heartbell", description: "给擦肩而过的心动，一次回应的机会。" };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="zh-CN"><body>{children}</body></html>; }
