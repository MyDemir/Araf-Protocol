// [TR] Ana sayfa bölüm başlığı: küçük üst etiket + başlık. Tüm bölümler aynı ritimde.
// [EN] Home section header: eyebrow + title, one rhythm for every section.
const HomeSectionHeader = ({ eyebrow, title, id, tone = 'brand', className = '' }) => (
  <div className={`mb-5 min-w-0 ${className}`}>
    <p className={`text-[11px] font-semibold tracking-[0.2em] uppercase mb-2 ${tone === 'muted' ? 'text-textMuted' : 'text-brand'}`}>{eyebrow}</p>
    {title && <h2 id={id} className="text-xl md:text-2xl font-bold text-textPrimary tracking-tight text-balance">{title}</h2>}
  </div>
);

export default HomeSectionHeader;
