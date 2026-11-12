/**
 * Berkas unggahan sebagai body mentah. Web mengirim `Blob`; React Native (tanpa File API
 * browser) mengirim byte hasil dekode beserta tipe MIME-nya.
 */
export type UploadFile = Blob | { data: ArrayBuffer; type: string };

export const uploadBody = (file: UploadFile): Blob | ArrayBuffer =>
  file instanceof Blob ? file : file.data;
