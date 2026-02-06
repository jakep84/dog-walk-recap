import { db } from "./firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

export async function createWalk(data: any) {
  const docRef = await addDoc(collection(db, "walks"), {
    ...data,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
}
