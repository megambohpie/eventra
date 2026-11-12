const grouped = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

interface CurrencyInputProps {
  /** Nilai mentah berupa digit saja (mis. "120000"); string kosong = belum diisi. */
  value: string;
  onChange: (digits: string) => void;
  required?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}

/** Standar input nominal rupiah: awalan Rp, pemisah ribuan otomatis, tanpa tombol spinner. */
export function CurrencyInput({
  value,
  onChange,
  required,
  disabled,
  ariaLabel,
}: CurrencyInputProps) {
  const display = value === '' ? '' : grouped.format(Number(value));
  return (
    <div className="input ev-control ev-currency">
      <span className="ev-currency__prefix">Rp</span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={ariaLabel}
        required={required}
        disabled={disabled}
        value={display}
        placeholder="0"
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 12))}
      />
    </div>
  );
}
