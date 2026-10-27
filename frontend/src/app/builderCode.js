// [TR] Base Builder Code (ERC-8021): tüm kontrat yazmalarının calldata sonuna eklenen atıf eki (viem `dataSuffix`).
//      Biçim: ASCII(kod) + 1 bayt uzunluk + 0x00 (şema 0) + 16 bayt ERC-8021 işaretçisi.
//      Kaynak: https://www.base.org/blog/builder-codes-and-erc-8021-fixing-onchain-attribution
//      Geçersiz kod -> ek '' (işlem eksiz gider; asla fırlatmaz, işlemi bozmaz).
// [EN] Base Builder Code (ERC-8021) calldata suffix for every contract write (viem `dataSuffix`).
//      Layout: ASCII(code) + 1-byte length + 0x00 (schema id) + 16-byte ERC-8021 marker. Invalid code -> '' (tx goes unattributed).

const ERC_8021_MARKER = '80218021802180218021802180218021';
export const DEFAULT_BUILDER_CODE = 'bc_8rl9wmjx';

/** @returns {string} 0x-hex ek; kod geçersizse ''. */
export function encodeBuilderCodeSuffix(code) {
  if (typeof code !== 'string' || code.length === 0 || code.length > 255) return '';
  let hex = '';
  for (let i = 0; i < code.length; i += 1) {
    const c = code.charCodeAt(i);
    if (c < 0x20 || c > 0x7e) return '';
    hex += c.toString(16).padStart(2, '0');
  }
  return `0x${hex}${code.length.toString(16).padStart(2, '0')}00${ERC_8021_MARKER}`;
}

const resolveBuilderCode = () => {
  try {
    const raw = import.meta.env?.VITE_BASE_BUILDER_CODE;
    const v = typeof raw === 'string' ? raw.trim() : '';
    return v || DEFAULT_BUILDER_CODE;
  } catch { return DEFAULT_BUILDER_CODE; }
};

export const BUILDER_CODE = resolveBuilderCode();
export const BUILDER_DATA_SUFFIX = encodeBuilderCodeSuffix(BUILDER_CODE);
/** [TR] writeContract/estimateContractGas'a yayılır; ek yoksa boş nesne. [EN] Spread into viem params; {} when no suffix. */
export const BUILDER_SUFFIX_PARAMS = BUILDER_DATA_SUFFIX ? { dataSuffix: BUILDER_DATA_SUFFIX } : {};
