FROM mhart/alpine-node:latest

# https://blog.docker.com/2016/07/live-debugging-docker/

WORKDIR /code

RUN npm --version
RUN ulimit -n

# https://github.com/npm/npm/issues/7862
# https://github.com/npm/npm/issues/8836
RUN npm config set maxsockets 5
RUN npm config set registry http://registry.npmjs.org/
RUN npm config set strict-ssl false
RUN npm install -g node-gyp

RUN npm install -g node-dev typescript@beta

COPY package.json /code/package.json
RUN npm install && npm link typescript && npm ls

COPY . /code
RUN npm run transpile

CMD ["npm", "start"]
