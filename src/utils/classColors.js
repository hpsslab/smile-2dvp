// Define a fixed palette of distinct colors
const COLORS = [
  "#22c55e", // green
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#eab308", // yellow
];

export function getColorForClass(labelId) {
  // Deterministic color selection
  return COLORS[labelId % COLORS.length];
}
