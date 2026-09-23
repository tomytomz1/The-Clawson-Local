/**
 * Storage port for intake uploads. Production uses the private Supabase
 * Storage bucket (lib/intake/server.ts); tests use an in-memory fake. The
 * browser never talks to Storage except through a short-lived signed upload
 * URL for one server-generated path.
 */
export const INTAKE_BUCKET = "intake-assets";
/** How long admin download links stay valid. */
export const DOWNLOAD_URL_SECONDS = 300;
/** Bytes read back from an upload to check its real type. */
export const SNIFF_BYTES = 4096;

export type StoredObject = { size: number; contentType: string | null; head: Uint8Array };

export type IntakeStorage = {
  /** Signed URL the browser PUTs the file to (no overwrite). */
  createUploadUrl(path: string): Promise<string>;
  /** The stored object's real size, type and first bytes; null if absent. */
  inspect(path: string): Promise<StoredObject | null>;
  remove(paths: string[]): Promise<void>;
  /** Short-lived link that downloads as an attachment (never renders inline). */
  downloadUrl(path: string, filename: string, seconds?: number): Promise<string>;
};
