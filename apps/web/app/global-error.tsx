"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          color: "#262A26",
          background: "#F7F8F7",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ fontSize: "0.875rem", color: "#545B54", maxWidth: "24rem" }}>
          The application hit an unexpected error and couldn&apos;t recover on its own.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            height: "2.5rem",
            padding: "0 1.25rem",
            borderRadius: 999,
            background: "#2F6B4F",
            color: "#FFFFFF",
            fontSize: "0.875rem",
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
