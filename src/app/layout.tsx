import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent SpendGuard",
  description:
    "Agent SpendGuard 让 AI Agent 在可撤销预算内完成 x402 API 支付，主钱包保持隔离。",
  icons: {
    icon: "/loge.svg",
    shortcut: "/loge.svg",
    apple: "/loge.svg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
