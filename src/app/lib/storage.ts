// src/app/lib/storage.ts
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

export type MediaType = "image" | "video";

export type WalkMedia = {
  url: string;
  path: string;
  type: MediaType;
  contentType: string;
  name: string;
  size: number;
  createdAt: string; // ISO
};

function inferMediaType(file: File): MediaType {
  return file.type.startsWith("video/") ? "video" : "image";
}

function safeFileName(name: string) {
  // avoid weird chars in paths
  return name.replace(/[^\w.\-]+/g, "_");
}

export async function uploadMedia(
  walkId: string,
  file: File,
): Promise<WalkMedia> {
  // 1) Decide whether it's image or video based on mime type
  const type = inferMediaType(file);

  // 2) Make a unique filename
  const unique = crypto.randomUUID();
  const filename = `${unique}-${safeFileName(file.name || `${type}`)}`;

  // 3) Build a storage path (organized per-walk)
  const path = `walks/${walkId}/${filename}`;

  // 4) Create a Storage reference
  const fileRef = ref(storage, path);

  // 5) Upload the raw bytes (Firebase SDK handles CORS correctly)
  await uploadBytes(fileRef, file, {
    contentType: file.type || (type === "video" ? "video/mp4" : "image/jpeg"),
  });

  // 6) Get a public-ish download URL (works with your permissive rules)
  const url = await getDownloadURL(fileRef);

  // 7) Return metadata you can store in Firestore
  return {
    url,
    path,
    type,
    contentType: file.type || "",
    name: file.name || filename,
    size: file.size,
    createdAt: new Date().toISOString(),
  };
}
