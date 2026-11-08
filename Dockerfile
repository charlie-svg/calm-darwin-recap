FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache ffmpeg fontconfig \
  && mkdir -p /usr/local/share/fonts/truetype/recap \
  && fc-cache -f
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/server ./server
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/assets/fonts/NotoSerifMyanmar-Regular.ttf /usr/local/share/fonts/truetype/recap/NotoSerifMyanmar-Regular.ttf
RUN fc-cache -f
EXPOSE 3000
CMD ["npm", "start"]
