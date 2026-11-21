FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY front/package.json front/package.json
COPY back/package.json back/package.json
RUN npm ci
COPY front front
RUN npm run build --workspace front

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app/front
COPY --from=build /app/front/dist ./dist
COPY front/serve.mjs ./serve.mjs
USER node
EXPOSE 3000
CMD ["node", "serve.mjs"]
