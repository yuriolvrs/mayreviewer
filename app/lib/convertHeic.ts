import { HEIC_CONVERT_ERROR, heicToJpegName } from "@/app/lib/attachmentLimits";

// Converts a HEIC/HEIF photo to a JPEG File in the browser. The library is
// large, so it loads only when a HEIC file is actually picked.
export async function convertHeicToJpeg(file: File): Promise<File> {
  try {
    const { default: heic2any } = await import("heic2any");
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(out) ? out[0] : out;
    return new File([blob], heicToJpegName(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    throw new Error(`"${file.name}": ${HEIC_CONVERT_ERROR}`);
  }
}
