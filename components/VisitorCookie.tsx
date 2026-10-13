"use client";

import { useEffect } from "react";

/** Persists the server-issued visitor identifier as a first-party cookie. */
export function VisitorCookie({ value }: { value: string }) {
  useEffect(() => {
    document.cookie = `marketing_visitor=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
  }, [value]);
  return null;
}
