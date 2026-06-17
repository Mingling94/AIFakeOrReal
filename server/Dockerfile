FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production=false

COPY . .

RUN npm run build

EXPOSE 8000

CMD ["node", "dist/index.js"]
