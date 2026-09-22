import { z } from "zod";
import { CAMPAIGN_STATUSES } from "@/types/campaign";

const TZ = "America/Detroit";

/** Offset (ms) of America/Detroit from UTC at the given instant. */
function detroitOffsetMs(at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - at.getTime();
}

/** "2026-11-02T17:00" (Clawson local time) -> ISO UTC timestamp. */
export function detroitLocalToIso(local: string): string {
  const [date, time = "00:00"] = local.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offset = detroitOffsetMs(new Date(guess - detroitOffsetMs(new Date(guess))));
  return new Date(guess - offset).toISOString();
}

/** ISO timestamp -> "YYYY-MM-DDTHH:mm" in Clawson local time (for datetime-local inputs). */
export function isoToDetroitLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const local = new Date(d.getTime() + detroitOffsetMs(d));
  return local.toISOString().slice(0, 16);
}

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const optionalDate = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullable(),
);

const optionalLocalDateTime = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use a date and time")
    .transform(detroitLocalToIso)
    .nullable(),
);

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

/** Admin campaign form -> validated `campaigns` column values. */
export const campaignUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    market: z.string().trim().min(1).max(80),
    state: z.string().trim().min(1).max(80),
    status: z.enum(CAMPAIGN_STATUSES as [string, ...string[]]),
    price_dollars: z.coerce.number().positive().max(100000),
    max_advertisers: int(1, 200),
    planned_reach: int(1, 1_000_000),
    reach_is_estimated: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
    verified_reach: z.preprocess(emptyToNull, z.coerce.number().int().min(1).max(1_000_000).nullable()),
    included_revisions: int(0, 10),
    reservation_minutes: int(5, 240),
    sales_open_at: optionalLocalDateTime,
    sales_close_at: optionalLocalDateTime,
    asset_deadline: optionalDate,
    proof_deadline: optionalDate,
    print_date: optionalDate,
    mailing_date: optionalDate,
    outside_fulfillment_date: optionalDate,
  })
  .refine((v) => v.reach_is_estimated || v.verified_reach !== null, {
    message: "Enter the verified reach before marking reach as verified.",
    path: ["verified_reach"],
  })
  .transform(({ price_dollars, ...rest }) => ({
    ...rest,
    price_cents: Math.round(price_dollars * 100),
  }));

export type CampaignUpdate = z.output<typeof campaignUpdateSchema>;

export const uuidSchema = z.string().uuid();
export const toggleSchema = z.object({
  category_id: uuidSchema,
  value: z.enum(["true", "false"]).transform((v) => v === "true"),
});
