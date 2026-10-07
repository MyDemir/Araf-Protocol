# Release notes / Sürüm notları

## How a release is made (EN)

1. Write the notes in `docs/releases/<tag>.md` (for example `v3.1.0.md`).
2. `release.yml` and the notes file must be on `main`.
3. Tag the main commit and push the tag:
   `git tag -a vX.Y.Z -m "Araf Protocol vX.Y.Z" <main-commit> && git push origin vX.Y.Z`
4. The Release workflow (`.github/workflows/release.yml`) creates the GitHub release from the notes file. If the
   release already exists, it updates the notes.
5. Fallback: `gh workflow run release.yml -f tag=vX.Y.Z`.
6. A tag containing `-` (for example `v3.1.0-rc1`) is published as a pre-release.

## Sürüm nasıl çıkarılır (TR)

1. Notu `docs/releases/<etiket>.md` olarak yaz (örn. `v3.1.0.md`).
2. `release.yml` ve not dosyası `main`'de olmalı.
3. main'deki commit'i etiketle ve etiketi gönder:
   `git tag -a vX.Y.Z -m "Araf Protocol vX.Y.Z" <main-commit> && git push origin vX.Y.Z`
4. Release workflow'u (`.github/workflows/release.yml`) notlardan GitHub release'ini oluşturur; release varsa
   notları günceller.
5. Yedek yol: `gh workflow run release.yml -f tag=vX.Y.Z`.
6. İçinde `-` olan etiketler (örn. `v3.1.0-rc1`) pre-release olur.
