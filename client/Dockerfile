FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package-lock.json ./client/

RUN cd client && npm ci

COPY client ./client

ARG VITE_API_URL=/api
ARG VITE_SOCKET_URL=http://localhost:5173
ARG VITE_STUN_URL=stun:stun.l.google.com:19302
ARG VITE_TURN_URL=
ARG VITE_TURN_USERNAME=
ARG VITE_TURN_CREDENTIAL=

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
ENV VITE_STUN_URL=$VITE_STUN_URL
ENV VITE_TURN_URL=$VITE_TURN_URL
ENV VITE_TURN_USERNAME=$VITE_TURN_USERNAME
ENV VITE_TURN_CREDENTIAL=$VITE_TURN_CREDENTIAL

RUN cd client && npm run build

FROM nginx:1.27-alpine AS runner

COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
