import { site } from "@/config/site";
import type { CampaignConfig } from "@/types/campaign";

/**
 * Illustrative 9x12 mailer. Deliberately shows empty, labeled placement
 * slots — never invented businesses or logos — and is clearly marked as a
 * preview so it cannot be mistaken for an already-mailed edition.
 */
export function MailerMockup({
  campaign,
  slots,
  highlight,
}: {
  campaign: CampaignConfig;
  slots: string[];
  highlight?: string;
}) {
  const shown = slots.slice(0, 10);
  return (
    <figure className="relative mx-auto w-full max-w-md">
      <div className="absolute -top-3 left-4 z-10 rounded-sm bg-ink px-3 py-1 text-xs font-semibold tracking-wide text-paper uppercase shadow">
        {campaign.campaignName} Preview
      </div>
      <div
        className="aspect-[3/4] rotate-1 border border-rule bg-card p-4 shadow-[0_18px_40px_-18px_rgba(27,26,23,0.45),0_2px_6px_rgba(27,26,23,0.12)] sm:p-5"
        aria-hidden="true"
      >
        <div className="flex h-full flex-col">
          <div className="rule-double pt-2 text-center">
            <p className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
              The Clawson <span className="text-accent">Local</span>
            </p>
            <p className="mt-0.5 font-serif text-[0.65rem] italic text-ink-soft sm:text-xs">
              {site.consumerTagline}
            </p>
          </div>
          <div className="mt-2 flex items-center justify-between border-y border-ink py-1 text-[0.55rem] font-semibold tracking-widest uppercase sm:text-[0.6rem]">
            <span>{campaign.campaignName}</span>
            <span>
              {campaign.marketName}, {campaign.state}
            </span>
          </div>
          <div className="mt-3 grid flex-1 grid-cols-2 gap-2">
            {shown.map((label) => {
              const isHighlight = highlight === label;
              return (
                <div
                  key={label}
                  className={`flex flex-col justify-between border p-2 ${
                    isHighlight
                      ? "border-accent bg-accent-tint"
                      : "border-dashed border-rule bg-paper"
                  }`}
                >
                  <span
                    className={`text-[0.55rem] font-semibold tracking-wider uppercase sm:text-[0.6rem] ${
                      isHighlight ? "text-accent" : "text-ink-muted"
                    }`}
                  >
                    {label}
                  </span>
                  <span className="space-y-1">
                    <span className="block h-1.5 w-3/4 bg-rule" />
                    <span className="block h-1.5 w-1/2 bg-rule" />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <figcaption className="mt-4 text-center text-xs text-ink-soft">
        <span className="inline-block rounded-sm bg-paper/90 px-2 py-0.5">
          Illustrative 9&Prime; × 12&Prime; layout. Final edition design will differ.
        </span>
      </figcaption>
    </figure>
  );
}
