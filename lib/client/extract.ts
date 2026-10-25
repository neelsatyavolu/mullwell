"use client";

// Reads what the student drops in: PDFs (text per page), photos of notes
// (downscaled for transcription), and plain text or Markdown files.

const MAX_IMAGE_EDGE = 1600;
const MAX_PDF_PAGES = 300;

export type Extracted = { kind: "text"; text: string; title: string } | { kind: "images"; images: string[]; title: string };

/** A readable placeholder from a file name ("S_D6Elasticity.pdf" -> "S D6 Elasticity") until the lesson planner names the set. */
export const baseName = (name: string) =>
  name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([0-9])([A-Za-z]{2,})/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "Untitled set";

async function pdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let n = 1; n <= Math.min(doc.numPages, MAX_PDF_PAGES); n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    let text = "";
    let lastY: number | null = null;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = item.transform[5];
      text += lastY !== null && Math.abs(y - lastY) > 2 ? `\n${item.str}` : item.str;
      if (item.hasEOL) text += "\n";
      lastY = y;
    }
    const clean = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (clean) pages.push(`## Page ${n}\n\n${clean}`);
  }
  await task.destroy();
  return pages.join("\n\n");
}

/** A JPEG data URL no larger than MAX_IMAGE_EDGE on its long side. */
export async function shrinkImage(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

export async function extractFiles(files: File[]): Promise<Extracted> {
  const images = files.filter((f) => f.type.startsWith("image/"));
  if (images.length) {
    if (images.length > 6) throw new Error("Add up to 6 photos at a time.");
    return { kind: "images", images: await Promise.all(images.map(shrinkImage)), title: baseName(images[0].name) };
  }
  const texts = await Promise.all(
    files.map(async (f) => {
      if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) return pdfText(f);
      if (f.type.startsWith("text/") || /\.(md|markdown|txt|csv|tex)$/i.test(f.name)) return f.text();
      throw new Error(`Mullwell can't read ${f.name} yet. Use a PDF, a photo, or a text file.`);
    }),
  );
  const text = texts.join("\n\n").trim();
  if (!text) throw new Error("No text found. If it's a scanned PDF, take photos of the pages instead.");
  return { kind: "text", text, title: baseName(files[0].name) };
}
