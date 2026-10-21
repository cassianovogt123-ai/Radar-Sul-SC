FROM node:22-slim
WORKDIR /app
COPY package*.json bun.lock* ./
RUN npm install
COPY . .
ARG VITE_API_BASE=""
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["npx", "tsx", "server.ts"]
