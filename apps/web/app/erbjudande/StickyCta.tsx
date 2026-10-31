"use client";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

/** Fast knapp på mobilen, när hjältebildens knapp har skrollats bort. */
export default function StickyCta() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 420);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className={`offer-sticky${show ? " on" : ""}`} aria-hidden={!show}>
      <a href="#registrera" tabIndex={show ? 0 : -1}>Testa gratis <span>bara 5 % per order</span> <ArrowRight size={18} aria-hidden="true" /></a>
    </div>
  );
}
