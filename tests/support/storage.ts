import type { IntakeStorage } from "@/lib/intake/storage";

/**
 * In-memory stand-in for the private Supabase Storage bucket. Like the real
 * bucket it has no public URLs: objects are reachable only through URLs the
 * server signs, and uploads never overwrite (upsert: false).
 */
export function fakeStorage() {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const uploadUrls = new Map<string, string>(); // url -> path
  const signed: string[] = [];
  let seq = 0;
  const storage: IntakeStorage = {
    async createUploadUrl(path) {
      const url = `https://storage.test/object/upload/sign/intake-assets/${path}?token=t${++seq}`;
      uploadUrls.set(url, path);
      return url;
    },
    async inspect(path) {
      const o = objects.get(path);
      return o ? { size: o.bytes.length, contentType: o.contentType, head: o.bytes.slice(0, 4096) } : null;
    },
    async remove(paths) {
      for (const p of paths) objects.delete(p);
    },
    async downloadUrl(path, filename, seconds = 300) {
      const url = `https://storage.test/object/sign/intake-assets/${path}?token=d${++seq}&expires=${seconds}&download=${encodeURIComponent(filename)}`;
      signed.push(url);
      return url;
    },
  };
  /** What the browser does with a signed upload URL. */
  function put(url: string, bytes: Uint8Array, contentType: string) {
    const path = uploadUrls.get(url);
    if (!path) throw new Error("invalid upload url");
    if (objects.has(path)) throw new Error("409 Duplicate: object exists (upsert disabled)");
    objects.set(path, { bytes, contentType });
    return path;
  }
  /** Anonymous read by path, as a public bucket would allow. Always refused. */
  function publicGet(path: string): null {
    void path;
    return null;
  }
  return { storage, objects, put, publicGet, signed };
}

const enc = (s: string) => new TextEncoder().encode(s);
const pad = (head: number[], size: number) => {
  const b = new Uint8Array(size);
  b.set(head);
  return b;
};

export const FILES = {
  png: (size = 2048) => pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], size),
  jpg: (size = 2048) => pad([0xff, 0xd8, 0xff, 0xe0], size),
  pdf: (size = 2048) => pad([...enc("%PDF-1.7\n")], size),
  webp: (size = 2048) => pad([...enc("RIFF"), 0, 0, 0, 0, ...enc("WEBP")], size),
  svg: () => enc('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  html: () => enc("<html><script>alert(1)</script></html>"),
  gif: () => pad([...enc("GIF89a")], 256),
};
