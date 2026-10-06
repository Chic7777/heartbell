import type { ButtonHTMLAttributes, ReactNode } from "react";
export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`button ${props.className ?? ""}`} />;
}
export function Card({ children }: { children: ReactNode }) { return <section className="card">{children}</section>; }
export function PhoneFrame({ children }: { children: ReactNode }) { return <main className="phone"><div className="notch" />{children}</main>; }
