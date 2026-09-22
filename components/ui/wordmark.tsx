export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span
      className={`font-serif font-bold tracking-tight text-ink ${
        size === "lg" ? "text-3xl" : "text-lg sm:text-xl"
      }`}
    >
      The Clawson <span className="text-accent">Local</span>
    </span>
  );
}
