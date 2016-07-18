FROM mhart/alpine-node:latest

# https://blog.docker.com/2016/07/live-debugging-docker/

WORKDIR /code

RUN npm install -g node-dev typescript@beta

COPY package.json /code/package.json
RUN npm install && npm link typescript && npm ls

COPY . /code
RUN npm run transpile

CMD ["npm", "start"]