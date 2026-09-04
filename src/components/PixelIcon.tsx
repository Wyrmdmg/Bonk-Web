// Pixel icons from public/ui/. 293 icons in two variants: `a` (dark red-brown,
// for light grounds) and `b` (gold, for ink panels). 86 have semantic names,
// the rest are addressed by grid position, e.g. <PixelIcon name="r10c02" />.
// Sprites are integer-scaled and never smoothed; keep `size` a multiple of 16.
import { useState } from "react";

type Props = {
  name: string;
  size?: 16 | 32 | 48 | 64;
  variant?: "dark" | "gold";
  className?: string;
  alt?: string;
};

export function PixelIcon({ name, size = 32, variant = "dark", className = "", alt = "" }: Props) {
  return (
    <img
      src={`/ui/${variant === "gold" ? "b" : "a"}/${name}.png`}
      width={size}
      height={size}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      draggable={false}
      className={`pixel shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

// Companion and shop sprites. This project ships without them: the artwork it
// was built against is licensed and cannot be redistributed. Drop your own
// 144px PNGs into public/pets/ using the file names in src/lib/companions.ts
// and the companion screen fills in. Until then a sprite renders as an empty
// framed square rather than a broken image. See docs/companions.md.
export function PetSprite({
  file,
  size = 72,
  className = "",
  alt = "",
  onAnimationEnd,
}: {
  file: string;
  size?: 36 | 72 | 144;
  className?: string;
  alt?: string;
  /** Lets a caller clear a one-shot animation class when it finishes. */
  onAnimationEnd?: () => void;
}) {
  const [missing, setMissing] = useState(false);

  if (missing) {
    return (
      <span
        aria-hidden={alt ? undefined : true}
        aria-label={alt || undefined}
        className={`sprite-slot ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <img
      src={`/pets/${file}`}
      width={size}
      height={size}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      draggable={false}
      onAnimationEnd={onAnimationEnd}
      onError={() => setMissing(true)}
      className={`pixel ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
