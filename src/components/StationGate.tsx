"use client";

import { useState } from "react";
import { Button, Card, Kicker } from "@/components/ui";

const STATION_NAME_KEY = "nsac_station_name";

export function useStationName() {
  const [stationName, setStationNameState] = useState<string | null>(() =>
    localStorage.getItem(STATION_NAME_KEY)
  );

  function setStationName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem(STATION_NAME_KEY, trimmed);
    setStationNameState(trimmed);
  }

  function clearStationName() {
    localStorage.removeItem(STATION_NAME_KEY);
    setStationNameState(null);
  }

  return { stationName, setStationName, clearStationName };
}

export default function StationGate({
  onSubmit,
}: {
  onSubmit: (name: string) => void;
}) {
  const [input, setInput] = useState("");

  return (
    <main className="flex-1 flex items-center justify-center p-6 brand-glow">
      <Card className="w-full max-w-sm p-8 space-y-5">
        <div className="space-y-1.5">
          <Kicker>This device</Kicker>
          <h1 className="font-display text-2xl text-navy">
            Name this station
          </h1>
          <p className="text-sm text-navy/55">
            e.g. &quot;Main Entrance&quot; or &quot;Hall B&quot; — shown on
            every check-in made from this device.
          </p>
        </div>
        <input
          autoFocus
          className="w-full rounded-lg border border-navy/15 px-4 py-2.5 text-navy placeholder:text-navy/35 outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit(input)}
          placeholder="Station name"
        />
        <Button
          variant="gold"
          className="w-full"
          disabled={!input.trim()}
          onClick={() => onSubmit(input)}
        >
          Continue
        </Button>
      </Card>
    </main>
  );
}
