import { describe, expect, it } from "vitest";
import { checkDeclaredUpload, sanitizeFilename, sniffContentType } from "@/lib/intake/files";
import { missingRequirements } from "@/lib/intake/requirements";
import { deriveIntakeToken, hashIntakeToken, intakeSecret, isWellFormedToken } from "@/lib/intake/token";
import { FILES } from "../support/storage";

describe("intake token", () => {
  const secret = "s".repeat(32);
  it("is a 43-char base64url HMAC, stable per advertiser, distinct across advertisers and secrets", () => {
    const t = deriveIntakeToken("11111111-1111-1111-1111-111111111111", secret);
    expect(isWellFormedToken(t)).toBe(true);
    expect(deriveIntakeToken("11111111-1111-1111-1111-111111111111", secret)).toBe(t);
    expect(deriveIntakeToken("22222222-2222-2222-2222-222222222222", secret)).not.toBe(t);
    expect(deriveIntakeToken("11111111-1111-1111-1111-111111111111", "t".repeat(32))).not.toBe(t);
    expect(hashIntakeToken(t)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("fails closed without a 32+ character secret", () => {
    expect(intakeSecret(undefined)).toBeNull();
    expect(intakeSecret("")).toBeNull();
    expect(intakeSecret("x".repeat(31))).toBeNull();
    expect(intakeSecret("x".repeat(32))).toBe("x".repeat(32));
  });
  it("rejects malformed tokens", () => {
    for (const bad of ["", "a", "a".repeat(44), "a".repeat(42) + "=", "../" + "a".repeat(40), null, undefined, 1]) expect(isWellFormedToken(bad)).toBe(false);
  });
});

describe("intake files", () => {
  it("recognizes real file types from their bytes", () => {
    expect(sniffContentType(FILES.png())).toBe("image/png");
    expect(sniffContentType(FILES.jpg())).toBe("image/jpeg");
    expect(sniffContentType(FILES.pdf())).toBe("application/pdf");
    expect(sniffContentType(FILES.webp())).toBe("image/webp");
    expect(sniffContentType(FILES.svg())).toBe("image/svg+xml");
    expect(sniffContentType(new TextEncoder().encode("\uFEFF  <svg viewBox='0 0 1 1'></svg>"))).toBe("image/svg+xml");
    expect(sniffContentType(FILES.html())).toBeNull();
    expect(sniffContentType(FILES.gif())).toBeNull();
    expect(sniffContentType(new Uint8Array())).toBeNull();
  });
  it("checks declared uploads per kind", () => {
    expect(checkDeclaredUpload("logo", "image/svg+xml", 100)).toBeNull();
    expect(checkDeclaredUpload("photo", "image/svg+xml", 100)).toBe("unsupported_type");
    expect(checkDeclaredUpload("artwork", "application/pdf", 50 * 1024 * 1024)).toBeNull();
    expect(checkDeclaredUpload("artwork", "application/pdf", 50 * 1024 * 1024 + 1)).toBe("file_too_large");
    expect(checkDeclaredUpload("logo", "image/png", 1.5)).toBe("empty_file");
    expect(checkDeclaredUpload("x", "image/png", 1)).toBe("invalid_kind");
  });
  it("sanitizes display filenames", () => {
    expect(sanitizeFilename("C:\\Users\\me\\My Logo (final).png")).toBe("My Logo _final_.png");
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("..hidden")).toBe("hidden");
    expect(sanitizeFilename("")).toBe("file");
    expect(sanitizeFilename("a".repeat(300) + ".pdf").length).toBeLessThanOrEqual(120);
  });
  it("mirrors the database submit requirements", () => {
    const base = { business_name: "B", contact_name: "C", contact_email: "e@x.co", phone: "2485550100" };
    expect(missingRequirements({}, { logo: false, artwork: false })).toEqual(["design_choice", "business_name", "contact_name", "contact_email", "phone"]);
    expect(missingRequirements({ ...base, design_choice: "BUILD_FOR_ME" }, { logo: false, artwork: false })).toEqual(["headline", "call_to_action", "logo"]);
    expect(missingRequirements({ ...base, design_choice: "FINISHED_ARTWORK" }, { logo: false, artwork: true })).toEqual([]);
  });
});
