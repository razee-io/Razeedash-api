#Build an intermediate image
FROM node:alpine as buildImg

RUN apk update
RUN apk --no-cache add gnupg python make
RUN apk add --upgrade --no-cache libssl1.1

RUN mkdir -p /usr/src/
ENV PATH="$PATH:/usr/src/"

WORKDIR /usr/src/
COPY package.json /usr/src/
COPY package-lock.json /usr/src/

RUN npm install --production --loglevel=warn
COPY . /usr/src/

# Build the production image
FROM node:alpine
RUN apk add --upgrade --no-cache libssl1.1

RUN mkdir -p /usr/src/
ENV PATH="$PATH:/usr/src/"
WORKDIR /usr/src/
COPY --from=buildImg /usr/src /usr/src

USER node

EXPOSE 3333
CMD ["npm", "start"]
