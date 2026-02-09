import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { app } from "./firebase";

export async function uploadRecapImage(walkId: string): Promise<string> {
  const storage = getStorage(app);

  // fetch server-generated PNG
  const r = await fetch(`/api/walk/${walkId}/recap-image`, {
    cache: "no-store",
  });
  if (!r.ok) throw new Error("Failed to render recap image.");

  const blob = await r.blob();

  const path = `walks/${walkId}/recap.png`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, blob, { contentType: "image/png" });
  return await getDownloadURL(storageRef);
}
