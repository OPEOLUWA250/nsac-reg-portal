"use client";

import { useState } from "react";
import { Button, Card, Eyebrow, Field, inputClass } from "@/components/ui";

const STATION_NAME_KEY = "nsac_station_name";

export function useStationName() {
  const [stationName, setStationNameState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STATION_NAME_KEY);
    } catch {
      return null;
    }
  });

  function setStationName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      localStorage.setItem(STATION_NAME_KEY, trimmed);
    } catch {
      /* storage blocked: the name only lasts for this page */
    }
    setStationNameState(trimmed);
  }

  function clearStationName() {
    try {
      localStorage.removeItem(STATION_NAME_KEY);
    } catch {
      /* ignore */
    }
    setStationNameState(null);
  }

  return { stationName, setStationName, clearStationName };
}

export default function StationGate({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) {
      setError("Give this station a name, for example Main entrance.");
      return;
    }
    onSubmit(input);
  }

  return (
    <main id="main" className="flex-1 flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm p-6 sm:p-8">
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div className="space-y-2">
            <Eyebrow>This device</Eyebrow>
            <h1 className="font-display text-2xl font-extrabold text-blue">Name this station</h1>
            <p className="text-sm text-ink-3">Shown on every check-in made from this device.</p>
          </div>
          <Field id="station-name" label="Station name" hint="For example Main entrance or Hall B." error={error}>
            <input
              id="station-name"
              autoFocus
              className={inputClass(!!error)}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError("");
              }}
              aria-invalid={!!error}
              aria-describedby={error ? "station-name-hint station-name-error" : "station-name-hint"}
            />
          </Field>
          <Button type="submit" variant="primary" className="w-full">
            Continue
          </Button>
        </form>
      </Card>
    </main>
  );
}
