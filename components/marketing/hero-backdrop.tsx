import Image from "next/image";
import downtownClawson from "@/public/images/downtown-clawson.webp";

export const HERO_PHOTO = {
  path: "/images/downtown-clawson.webp",
  description: "The Main Street clock in downtown Clawson, Michigan, at 14 Mile Road and Main Street",
  author: "Bmburch",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Downtown_Clawson_Main_Street_Clock.jpg",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
} as const;

/**
 * Faint photo of downtown Clawson behind the homepage hero. A paper-colored
 * wash keeps the headline, copy and CTA the strongest thing on screen.
 *
 * Wide screens: the photo is anchored to the page center (not stretched to the
 * viewport), so the Main Street clock (centered at 51.5% of the photo's width,
 * about 12.5% wide) always lands in the gutter between the copy and the mailer
 * preview. Phones: only the top of the stacked hero gets the photo, with the
 * clock framed at the right edge, clear of the headline.
 */
export function HeroBackdrop() {
  return (
    <>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[36rem] lg:inset-x-auto lg:inset-y-0 lg:left-1/2 lg:aspect-[4/3] lg:h-full lg:-translate-x-[51.5%] lg:[mask-image:linear-gradient(to_right,black_85%,transparent)]">
          <Image
            src={downtownClawson}
            alt=""
            fill
            sizes="(min-width: 1024px) 1400px, 800px"
            quality={50}
            placeholder="blur"
            className="object-cover object-[16%_0%] opacity-45 saturate-50 sepia-[20%] lg:object-center"
          />
        </div>
        {/* Phones: wash fades to solid paper below the photo. Wide: solid behind the copy, clear over the clock. */}
        <div className="absolute inset-x-0 top-0 h-[36rem] bg-linear-to-b from-paper/55 from-35% to-paper lg:inset-y-0 lg:h-auto lg:bg-linear-to-r lg:from-paper lg:from-25% lg:via-paper/30 lg:via-50% lg:to-paper/50" />
        {/* Wide: fade the street scene under the paragraph, CTA and checklist so only the clock reads strongly. */}
        <div className="absolute inset-0 hidden bg-linear-to-b from-transparent from-40% via-paper/75 via-60% to-paper/85 lg:block" />
      </div>
      <p className="container-page relative -mt-6 pb-4 text-right text-xs text-ink-soft sm:-mt-10 lg:-mt-14">
        <span className="inline-block rounded-sm bg-paper/90 px-2 py-0.5">
          <span aria-hidden="true">📍 </span>Downtown Clawson, 14 Mile &amp; Main
          <span className="mx-1.5" aria-hidden="true">
            ·
          </span>
          Photo:{" "}
          <a href={HERO_PHOTO.sourceUrl} className="underline underline-offset-2" rel="noopener">
            {HERO_PHOTO.author}
          </a>
          ,{" "}
          <a href={HERO_PHOTO.licenseUrl} className="underline underline-offset-2" rel="license noopener">
            {HERO_PHOTO.license}
          </a>
          , adapted
        </span>
      </p>
    </>
  );
}
