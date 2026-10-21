# Alpine Linux tabanlı, hafif ve güvenli bir Node.js imajı (index digest ile sabit; güncelleme: Docker Hub library/node 22-alpine).
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402

# Uygulama için çalışma dizini oluştur
WORKDIR /usr/src/app

# Güvenlik: runtime root user kullanma. Kullanıcı kod kopyalanmadan ÖNCE oluşturulur;
# böylece tüm uygulamayı yeniden sahiplenen ikinci bir katman gerekmez.
RUN addgroup -S nodeapp && adduser -S nodeapp -G nodeapp

# Bağımlılıkları kurmak için package dosyalarını kopyala
# Bu katman, kod değişmediği sürece cache'lenir ve build hızını artırır.
COPY package*.json ./

# Lockfile ile deterministic dependency kurulumu
RUN npm ci --omit=dev

# Uygulama kodu ROOT sahipli kalır (nodeapp okur/çalıştırır, değiştiremez): RCE halinde kalıcı kod değişikliği olmaz.
COPY . .

# Yazılabilir tek dizin: log dosyaları (logger.js, LOG_DIR verilmezse backend/logs). Geçici dosyalar /tmp'e yazılır.
RUN mkdir -p /usr/src/app/logs && chown nodeapp:nodeapp /usr/src/app/logs
USER nodeapp

# Uygulamanın çalışacağı portu belirt
EXPOSE 4000

# Uygulamayı başlat
# app.js, process.env.PORT'u dinleyecek şekilde ayarlandi.
CMD [ "node", "scripts/app.js" ]
