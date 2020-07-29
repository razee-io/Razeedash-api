#Build an intermediate image, have to use 12.x.x node since 13.x is not working for bcrypt yet
FROM node:lts-alpine as buildImg

RUN apk update
RUN apk --no-cache add gnupg python make
RUN apk add --upgrade --no-cache libssl1.1
RUN apk add --no-cache g++

RUN mkdir -p /usr/src/
ENV PATH="$PATH:/usr/src/"

WORKDIR /usr/src/
COPY package.json /usr/src/
COPY package-lock.json /usr/src/

RUN npm install --production --loglevel=warn
COPY . /usr/src/

# Build the production image
FROM node:lts-alpine
RUN apk add --upgrade --no-cache libssl1.1

RUN mkdir -p /usr/src/
ENV PATH="$PATH:/usr/src/"

RUN export BUILD_TIME=`date '+%Y-%m-%d %H:%M:%S'`

WORKDIR /usr/src/
COPY --from=buildImg /usr/src /usr/src

ARG BUILD_ID
ENV BUILD_ID=${BUILD_ID}

ARG BUILD_TIME
ENV BUILD_TIME=${BUILD_TIME}

EXPOSE 3333
CMD ["npm", "start"]
