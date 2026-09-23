import "server-only";
import { serverRpc } from "@/lib/checkout/server";
import { getAdminClient } from "@/lib/db/supabase";
import type { IntakeDeps } from "./service";
import { DOWNLOAD_URL_SECONDS, INTAKE_BUCKET, SNIFF_BYTES, type IntakeStorage } from "./storage";

/** Private Supabase Storage bucket, reached only with the service role. */
export function supabaseIntakeStorage(): IntakeStorage {
  const bucket = () => getAdminClient().storage.from(INTAKE_BUCKET);
  return {
    async createUploadUrl(path) {
      const { data, error } = await bucket().createSignedUploadUrl(path, { upsert: false });
      if (error || !data) throw error ?? new Error("createSignedUploadUrl returned nothing");
      return data.signedUrl;
    },
    async inspect(path) {
      const { data: info, error } = await bucket().info(path);
      if (error || !info) return null;
      const { data: signed, error: signError } = await bucket().createSignedUrl(path, 60);
      if (signError || !signed) throw signError ?? new Error("createSignedUrl returned nothing");
      const abort = new AbortController();
      const res = await fetch(signed.signedUrl, { headers: { Range: `bytes=0-${SNIFF_BYTES - 1}` }, cache: "no-store", signal: abort.signal });
      if (!res.ok || !res.body) return null;
      // Read at most SNIFF_BYTES even if the server ignored the Range header.
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < SNIFF_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.length;
      }
      // Not awaited: Next.js tees fetch bodies, and cancelling one branch of a
      // tee only settles once the other branch is cancelled too.
      void reader.cancel().catch(() => {});
      abort.abort(); // closes the connection even if the server ignored Range
      const head = new Uint8Array(Math.min(total, SNIFF_BYTES));
      let offset = 0;
      for (const c of chunks) {
        const part = c.subarray(0, head.length - offset);
        head.set(part, offset);
        offset += part.length;
        if (offset >= head.length) break;
      }
      const meta = info as { size?: number; contentType?: string; metadata?: { size?: number; mimetype?: string } };
      return {
        size: Number(meta.size ?? meta.metadata?.size ?? 0),
        contentType: meta.contentType ?? meta.metadata?.mimetype ?? null,
        head,
      };
    },
    async remove(paths) {
      if (!paths.length) return;
      const { error } = await bucket().remove(paths);
      if (error) throw error;
    },
    async downloadUrl(path, filename, seconds = DOWNLOAD_URL_SECONDS) {
      const { data, error } = await bucket().createSignedUrl(path, seconds, { download: filename });
      if (error || !data) throw error ?? new Error("createSignedUrl returned nothing");
      return data.signedUrl;
    },
  };
}

export function intakeDeps(): IntakeDeps {
  return { rpc: serverRpc(), storage: supabaseIntakeStorage() };
}
