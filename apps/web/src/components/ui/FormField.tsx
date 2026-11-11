import type { ReactNode } from 'react';

interface FormFieldProps {
  label: string;
  children: ReactNode;
}

/** Label + kontrol form DaisyUI (fieldset). Kontrol memakai kelas input/select/textarea DaisyUI. */
export function FormField({ label, children }: FormFieldProps) {
  return (
    <label className="fieldset">
      <span className="fieldset-legend">{label}</span>
      {children}
    </label>
  );
}
