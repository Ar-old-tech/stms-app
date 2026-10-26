export const DEFAULT_TILE_URL =
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const DEFAULT_TILE_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
export const TILE_URL =
  import.meta.env.VITE_TILE_URL?.trim() || DEFAULT_TILE_URL;
export const TILE_ATTRIBUTION =
  import.meta.env.VITE_TILE_ATTRIBUTION?.trim() || DEFAULT_TILE_ATTRIBUTION;
export const TILE_ERROR_THRESHOLD = 3;
