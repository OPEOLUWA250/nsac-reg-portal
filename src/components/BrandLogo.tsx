// The all-white conference logo, for blue surfaces. It is pre-scaled
// (public/brand/logo-88.png and logo-132.png, made from logo.png with a
// Lanczos filter) and served as-is: letting the image optimiser and the
// browser shrink the 1555px original 13 times made its thin letters soft.
export default function BrandLogo({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- pre-sized files, served untouched for sharpness
    <img
      src="/brand/logo-88.png"
      srcSet="/brand/logo-88.png 2x, /brand/logo-132.png 3x"
      alt=""
      width={119}
      height={44}
      className={`block h-11 w-auto ${className}`}
      decoding="async"
      fetchPriority="high"
    />
  );
}
