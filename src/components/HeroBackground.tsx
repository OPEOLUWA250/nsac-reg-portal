// Purely decorative: a deep-space backdrop for the homepage hero — a
// near-black-to-navy gradient, a hand-placed starfield, two faint orbit
// rings, and warm gold glows. All absolutely positioned layers stacked
// behind the hero content.
const STARFIELD = [
  "1px 1px at 10% 8%, rgba(255,255,255,0.9)",
  "1.5px 1.5px at 22% 15%, rgba(255,255,255,0.5)",
  "1px 1px at 35% 5%, rgba(247,193,92,0.6)",
  "2px 2px at 48% 20%, rgba(255,255,255,0.4)",
  "1px 1px at 60% 10%, rgba(255,255,255,0.7)",
  "1.5px 1.5px at 75% 6%, rgba(255,255,255,0.5)",
  "1px 1px at 88% 18%, rgba(247,193,92,0.5)",
  "1px 1px at 5% 35%, rgba(255,255,255,0.4)",
  "1.5px 1.5px at 15% 45%, rgba(255,255,255,0.6)",
  "1px 1px at 30% 38%, rgba(255,255,255,0.3)",
  "2px 2px at 42% 50%, rgba(247,193,92,0.4)",
  "1px 1px at 55% 42%, rgba(255,255,255,0.5)",
  "1.5px 1.5px at 68% 48%, rgba(255,255,255,0.4)",
  "1px 1px at 80% 40%, rgba(255,255,255,0.6)",
  "1px 1px at 92% 52%, rgba(255,255,255,0.4)",
  "1.5px 1.5px at 8% 65%, rgba(255,255,255,0.5)",
  "1px 1px at 20% 72%, rgba(255,255,255,0.3)",
  "1px 1px at 33% 68%, rgba(247,193,92,0.5)",
  "2px 2px at 46% 78%, rgba(255,255,255,0.4)",
  "1px 1px at 58% 70%, rgba(255,255,255,0.6)",
  "1.5px 1.5px at 70% 76%, rgba(255,255,255,0.4)",
  "1px 1px at 85% 68%, rgba(255,255,255,0.5)",
  "1px 1px at 95% 80%, rgba(255,255,255,0.3)",
  "1.5px 1.5px at 12% 88%, rgba(255,255,255,0.5)",
  "1px 1px at 27% 92%, rgba(247,193,92,0.4)",
  "1px 1px at 63% 90%, rgba(255,255,255,0.5)",
  "2px 2px at 90% 88%, rgba(255,255,255,0.3)",
]
  .map((s) => `radial-gradient(${s}, transparent 100%)`)
  .join(", ");

export default function HeroBackground() {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(160deg, var(--blue-3) 0%, var(--navy) 45%, var(--blue-2) 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: STARFIELD }}
      />
      <div
        className="pointer-events-none absolute rounded-full border border-white/[0.07]"
        style={{ width: 620, height: 620, top: "-12%", right: "-8%" }}
      />
      <div
        className="pointer-events-none absolute rounded-full border border-gold/[0.12]"
        style={{
          width: 900,
          height: 420,
          bottom: "-18%",
          left: "-10%",
          transform: "rotate(-12deg)",
        }}
      />
      <div
        className="pointer-events-none absolute -top-32 -right-32 h-[28rem] w-[28rem] rounded-full blur-3xl"
        style={{
          background: "radial-gradient(circle, rgba(240,159,7,0.22), transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 -left-24 h-[28rem] w-[28rem] rounded-full blur-3xl"
        style={{
          background: "radial-gradient(circle, rgba(10,74,122,0.45), transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{
          background: "radial-gradient(circle, rgba(247,193,92,0.16), transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 45%, rgba(5,13,26,0.55) 100%)",
        }}
      />
    </>
  );
}
