"use client";
import { useState, useCallback, useEffect } from "react";

type Toast = { id: number; message: string; type: "success" | "error" };

let addToastGlobal: ((msg: string, type: "success" | "error") => void) | null =
  null;

export function toast(message: string, type: "success" | "error" = "success") {
  addToastGlobal?.(message, type);
}

export function ToastProvider() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  let counter = 0;

  useEffect(() => {
    addToastGlobal = (message, type) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        3500
      );
    };
    return () => {
      addToastGlobal = null;
    };
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
