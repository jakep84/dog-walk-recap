// src/app/lib/uploadMedia.ts
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

export type WalkMedia = {
  url: string;
  path: string;
  type: "image" | "video";
  contentType: string;
  name: string;
  size: number;
  createdAt: string;
};

function inferType(file: File): "image" | "video" {
  return file.type?.startsWith("video/") ? "video" : "image";
}

function safeFileName(name: string) {
  return (name || "file").replace(/[^\w.\-]+/g, "_");
}

export async function uploadMedia(
  walkId: string,
  file: File,
): Promise<WalkMedia> {
  // 1) Decide media type
  const type = inferType(file);

  // 2) Create unique filename (prevents overwrites)
  const id = crypto.randomUUID();
  const filename = `${id}-${safeFileName(file.name)}`;

  // 3) Storage path per walk
  const path = `walks/${walkId}/${filename}`;

  // 4) Reference in *your configured bucket*
  const fileRef = ref(storage, path);

  // 5) Upload bytes (this is the Firebase SDK path; no manual fetch)
  await uploadBytes(fileRef, file, {
    contentType: file.type || (type === "video" ? "video/mp4" : "image/jpeg"),
  });

  // 6) Get a download URL that your viewer page can use
  const url = await getDownloadURL(fileRef);

  // 7) Return metadata to store in Firestore
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
