export function formatPersonName(
  value: string,
) {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join(" ");
}