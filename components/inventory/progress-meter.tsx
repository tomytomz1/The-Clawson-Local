import type { CampaignProgress } from "@/lib/inventory/progress";
import type { CampaignConfig } from "@/types/campaign";

/** Real campaign progress, computed from paid advertisers only. */
export function ProgressMeter({
  campaign,
  progress,
}: {
  campaign: CampaignConfig;
  progress: CampaignProgress;
}) {
  return (
    <div>
      <p className="eyebrow">{campaign.campaignName}</p>
      <p className="mt-1 font-serif text-2xl font-semibold">
        {progress.claimed} of {progress.max} positions claimed
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.max}
        aria-valuenow={progress.claimed}
        aria-label={`${progress.claimed} of ${progress.max} positions claimed`}
        className="mt-3 h-2.5 w-full overflow-hidden rounded-sm bg-rule"
      >
        <div className="h-full bg-accent" style={{ width: `${progress.percent}%` }} />
      </div>
    </div>
  );
}
