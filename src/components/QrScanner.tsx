"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { Button, Spinner } from "@/components/ui";
import { IconAlert } from "@/components/icons";

const ELEMENT_ID = "qr-scanner-region";

interface QrScannerProps {
  onScan: (decodedText: string) => void;
  paused: boolean;
}

type CameraState = { kind: "starting" } | { kind: "running" } | { kind: "error"; message: string };

// Plain-language reason the camera didn't start.
function cameraProblem(err: unknown): string {
  const text = String((err as Error)?.name ?? "") + " " + String((err as Error)?.message ?? err);
  if (/NotAllowed|Permission/i.test(text)) {
    return "Camera access was blocked. Allow the camera for this site in the browser settings, then try again.";
  }
  if (/NotFound|no camera|Requested device not found/i.test(text)) {
    return "No camera was found on this device.";
  }
  if (/NotReadable|in use/i.test(text)) {
    return "The camera is being used by another app. Close it, then try again.";
  }
  if (!window.isSecureContext) {
    return "The camera only works on a secure (https) address.";
  }
  return "The camera didn't start. Try again, or reload the page.";
}

export default function QrScanner(props: QrScannerProps) {
  // Changing the key remounts the scanner, which retries the camera.
  const [attempt, setAttempt] = useState(0);
  return <Scanner key={attempt} {...props} onRetry={() => setAttempt((n) => n + 1)} />;
}

function Scanner({ onScan, paused, onRetry }: QrScannerProps & { onRetry: () => void }) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const [camera, setCamera] = useState<CameraState>({ kind: "starting" });

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
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          if (!cancelled) onScanRef.current(decodedText);
        },
        () => {
          // per-frame decode failures are expected while no QR is in view — ignore
        }
      )
      .then(() => {
        if (!cancelled) setCamera({ kind: "running" });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to start camera", err);
        setCamera({ kind: "error", message: cameraProblem(err) });
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
    <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-lg border border-line bg-blue">
      <div id={ELEMENT_ID} className="min-h-72 w-full" />
      {camera.kind === "starting" && (
        <div role="status" className="on-dark absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-white/80">
          <Spinner className="h-6 w-6" />
          Starting the camera
        </div>
      )}
      {camera.kind === "error" && (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-surface p-6 text-center">
          <IconAlert className="h-7 w-7 text-danger" />
          <p className="text-sm text-ink-2">{camera.message}</p>
          <Button variant="primary" onClick={onRetry}>
            Try the camera again
          </Button>
        </div>
      )}
    </div>
  );
}
