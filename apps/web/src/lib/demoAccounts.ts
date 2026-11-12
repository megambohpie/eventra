/** Password akun contoh; hanya ada saat development dan bila diisi di .env (tidak pernah di-commit). */
export const DEMO_PASSWORD: string | undefined = import.meta.env.DEV
  ? import.meta.env.VITE_DEMO_PASSWORD
  : undefined;
