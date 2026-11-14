FROM node:20-slim
WORKDIR /app
COPY app/package.json app/package-lock.json ./
COPY app/shared/package.json shared/package.json
COPY app/server/package.json server/package.json
COPY app/web/package.json web/package.json
RUN npm ci
COPY app/ ./
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "server"]
