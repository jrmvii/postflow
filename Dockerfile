FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Accept real DATABASE_URL as build arg for prisma db push
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL:-postgresql://dummy:dummy@localhost:5432/dummy}

# Switch Prisma to PostgreSQL for production
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
RUN npx prisma generate

# Push schema to production DB if real DATABASE_URL is provided
RUN if echo "$DATABASE_URL" | grep -qv "dummy"; then npx prisma db push --skip-generate --accept-data-loss; fi

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "start"]
