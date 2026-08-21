"use client";

import { useEffect, useRef } from "react";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";

const ELEMENT_ID = "qr-scanner-region";

interface QrScannerProps {
  onScan: (decodedText: string) => void;
  paused: boolean;
}

export default function QrScanner({ onScan, paused }: QrScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    const scanner = new Html5Qrcode(ELEMENT_ID, { verbose: false });
    scannerRef.current = scanner;
    let cancelled = false;

    // .start() is async. In dev, React Strict Mode mounts this effect,
    // tears it down, then mounts it again — so the cleanup below can fire
    // before this promise has settled. Calling .stop() on a scanner that
    // hasn't finished starting throws synchronously, so cleanup must wait
    // for this promise first rather than stopping unconditionally.
    const startPromise = scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        (decodedText) => {
          if (!cancelled) onScanRef.current(decodedText);
        },
        () => {
          // per-frame decode failures are expected while no QR is in view — ignore
        }
      )
      .catch((err) => {
        if (!cancelled) console.error("Failed to start camera", err);
      });

    return () => {
      cancelled = true;
      startPromise.finally(() => {
        const state = scanner.getState();
        if (
          state === Html5QrcodeScannerState.SCANNING ||
          state === Html5QrcodeScannerState.PAUSED
        ) {
          scanner
            .stop()
            .then(() => scanner.clear())
            .catch(() => {
              /* already stopped */
            });
        }
      });
    };
  }, []);

  useEffect(() => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    const state = scanner.getState();
    if (paused && state === Html5QrcodeScannerState.SCANNING) scanner.pause(true);
    if (!paused && state === Html5QrcodeScannerState.PAUSED) scanner.resume();
  }, [paused]);

  return (
    <div
      id={ELEMENT_ID}
      className="w-full max-w-sm mx-auto overflow-hidden rounded-2xl border border-navy/10 shadow-[0_10px_28px_-12px_rgba(10,26,49,0.25)]"
    />
  );
}
