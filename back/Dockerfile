FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY front/package.json front/package.json
COPY back/package.json back/package.json
RUN npm ci
COPY back back
RUN npm run build --workspace back

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY front/package.json front/package.json
COPY back/package.json back/package.json
RUN npm ci --omit=dev --workspace back && npm cache clean --force
COPY --from=build /app/back/dist back/dist
COPY back/migrations back/migrations
USER node
WORKDIR /app/back
EXPOSE 3001
CMD ["node", "dist/index.js"]
