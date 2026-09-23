import Image from "next/image";
import downtownClawson from "@/public/images/downtown-clawson.webp";

/**
 * Faint photo of downtown Clawson behind the homepage hero. A paper-colored
 * wash keeps the headline, copy and CTA the strongest thing on screen. On
 * phones the crop centers the engraved "CLAWSON" lettering.
 */
export function HeroBackdrop() {
  return (
    <>
      {/* Phones: only the top of the (tall) stacked hero, so the photo is not stretched. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[36rem] overflow-hidden lg:inset-y-0 lg:h-auto"
      >
        <Image
          src={downtownClawson}
          alt=""
          fill
          sizes="(min-width: 1024px) 100vw, 900px"
          quality={50}
          placeholder="blur"
          className="object-cover object-[52%_0%] opacity-40 grayscale-[35%] sepia-[15%] lg:object-[50%_30%]"
        />
        {/* Phones: wash fades to solid paper. Wide: solid behind the copy, fading toward the photo. */}
        <div className="absolute inset-0 bg-linear-to-b from-paper/60 from-40% to-paper lg:bg-linear-to-r lg:from-paper lg:from-35% lg:via-paper/75 lg:to-paper/25" />
      </div>
      <p className="container-page relative -mt-6 pb-4 text-right text-xs tracking-wide text-ink-muted sm:-mt-10 lg:-mt-14">
        <span aria-hidden="true">📍 </span>Downtown Clawson, Michigan
      </p>
    </>
  );
}
