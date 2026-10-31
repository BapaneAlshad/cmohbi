"use client";
import { useEffect, useState } from "react";
import { jakartaDateKey } from "@/lib/campaign-timeline";

export function useJakartaToday() {
  const [today, setToday] = useState(jakartaDateKey);
  useEffect(() => {
    const update = () => setToday(jakartaDateKey());
    update(); const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update); document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, []);
  return today;
}
