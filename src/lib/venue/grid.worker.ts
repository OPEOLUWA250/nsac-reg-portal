import { buildGrid } from "@/lib/venue/pathfinding";

// Builds the walking grid off the main thread and hands it over without
// copying (see setGrid in pathfinding.ts).
const grid = buildGrid();
self.postMessage(grid, { transfer: [grid.blocked.buffer, grid.clear.buffer] });
