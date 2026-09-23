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
 * wash keeps the headline, copy and CTA the strongest thing on screen. The
 * Main Street clock sits in the gutter between the copy and the mailer
 * preview on wide screens; on phones only the top of the stacked hero gets
 * the photo so it is never stretched.
 */
export function HeroBackdrop() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[36rem] overflow-hidden lg:inset-y-0 lg:h-auto"
      >
        <Image
          src={downtownClawson}
          alt=""
          fill
          sizes="(min-width: 1024px) 100vw, 800px"
          quality={50}
          placeholder="blur"
          className="object-cover object-[16%_0%] opacity-45 saturate-50 sepia-[20%] lg:object-[50%_30%]"
        />
        {/* Phones: wash fades to solid paper. Wide: solid behind the copy, lighter over the clock and street. */}
        <div className="absolute inset-0 bg-linear-to-b from-paper/55 from-35% to-paper lg:bg-linear-to-r lg:from-paper lg:from-30% lg:via-paper/60 lg:via-50% lg:to-paper/35" />
      </div>
      <p className="container-page relative -mt-6 pb-4 text-right text-xs text-ink-muted sm:-mt-10 lg:-mt-14">
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
      </p>
    </>
  );
}
