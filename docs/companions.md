# Companions

The companion screen lets someone raise a small pixel animal by focusing.
Bond level is tied to account level, one bond level for every 3 account
levels, so it grows automatically as the timer gets used.

This repository ships with the companion feature's code fully working, but
without the artwork. The sprites shown on the live version of the site were
licensed artwork, purchased for that project, and cannot be redistributed
here. Until you add your own images, a companion slot renders as an empty
framed square instead of a broken image, so the app still looks intentional
with none installed.

## How the feature finds its sprites

Every companion and shop item is listed in `src/lib/companions.ts`, in two
arrays:

```
export const COMPANIONS: Companion[] = [
  { file: "A22_shiba.png", name: "petShiba", species: "speciesDog", unlockLevel: 1 },
  ...
];

export const SUPPLIES: Supply[] = [
  { file: "G22_foodBowl.png", name: "supplyFoodbowl", price: 30, unlockLevel: 1 },
  ...
];
```

The `file` field is the filename the app looks for under `public/pets/`. To
add your own artwork, drop a PNG at `public/pets/<file>` matching one of the
names already listed, for example `public/pets/A22_shiba.png`. As soon as
the file exists, that companion or supply displays it. Nothing else needs to
change.

## Image requirements

- PNG format.
- Square, at 144 by 144 pixels. Smaller sizes are scaled up, and since the
  art style is pixel art, scaling is done without smoothing, so a smaller
  source image will look chunky rather than sharp.
- Transparent background.

## Using your own set instead

You are not limited to the filenames already in `companions.ts`. To use a
different set of artwork entirely:

1. Add your PNGs to `public/pets/`, named however you like.
2. Edit the `COMPANIONS` and `SUPPLIES` arrays in `src/lib/companions.ts` so
   each `file` value matches one of your filenames.
3. Add matching translation keys for each `name` value in
   `src/lib/i18n/en.ts` (and the other language files, if you support them),
   since `name` is a translation key, not display text directly.

`unlockLevel` controls when a companion or supply becomes available, and
`price` controls its cost in the shop. Both are plain numbers you can adjust
freely.

## Where sprites are rendered

The component that draws a sprite, `PetSprite` in
`src/components/PixelIcon.tsx`, is the same one shown for both the
companion screen and the shop. It watches for the image failing to load and
falls back to the empty slot placeholder automatically, so you do not need
to add every sprite at once. Add them at your own pace and each one appears
as soon as its file exists.
