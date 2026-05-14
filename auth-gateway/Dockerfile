FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
ENV PORT=3005
EXPOSE 3005

CMD ["npm", "start"]
