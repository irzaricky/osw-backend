# Stage 1: Build stage
FROM node:24.13.1-slim AS builder

# Instal dependensi sistem untuk library seperti 'sharp'
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Salin manifest dependensi
COPY package*.json ./

# Instal semua dependensi
RUN npm install

# Salin seluruh kode sumber
COPY . .

# Stage 2: Production stage
FROM node:24.13.1-slim

WORKDIR /app

# Set environment ke production
ENV NODE_ENV=development

# Salin hasil instalasi dari stage builder
COPY --from=builder /app ./

# Expose port
EXPOSE 3001

# Script untuk menjalankan migrasi database sebelum aplikasi start
# menggunakan 'sh -c' agar bisa menjalankan banyak perintah sekaligus
CMD ["sh", "-c", "npx sequelize-cli db:migrate && node --expose-gc ./bin/www"]