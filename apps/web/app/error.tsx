"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-zinc-50">
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-black text-zinc-900">Något gick fel</h2>
        <p className="text-zinc-500">{error.message}</p>
        <button
          onClick={reset}
          className="px-6 py-3 bg-zinc-900 text-white rounded-xl font-bold"
        >
          Försök igen
        </button>
      </div>
    </div>
  );
}