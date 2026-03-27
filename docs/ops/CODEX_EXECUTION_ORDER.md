# Codex Execution Order

Codex bu dalda çalışırken aşağıdaki öncelik sırasını izlemelidir:

1. `docs/ops/ARAF_P0_FIXES_SOURCE_OF_TRUTH.md` dosyasını **birincil kaynak** olarak oku.
2. Kod değişikliklerini bu dosyada verilen **tam fix bloklarına sadık kalarak** uygula.
3. `docs/ops/CODEX_P0_HARDENING_BRIEF.md` dosyasını yalnızca:
   - uygulama sırası,
   - rollout ayrımı,
   - kabul kriterleri,
   - commit planı
   için kullan.
4. Bir çelişki varsa **source of truth** dosyası kazanır.
5. Fix metninde verilmeyen ek yorumlayıcı refactor yapma.
6. Özellikle auth/session/trade-room akışlarında davranış değişikliği gerekiyorsa önce source of truth dosyasındaki snippet'e uy.

## Kısa talimat

- First read: `docs/ops/ARAF_P0_FIXES_SOURCE_OF_TRUTH.md`
- Then implement exactly.
- Use `docs/ops/CODEX_P0_HARDENING_BRIEF.md` only as operational guidance.
- If the two documents differ, `ARAF_P0_FIXES_SOURCE_OF_TRUTH.md` wins.
