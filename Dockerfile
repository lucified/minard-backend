FROM node:8.1-alpine

WORKDIR /code

RUN npm --version
RUN ulimit -n

# https://github.com/npm/npm/issues/7862
# https://github.com/npm/npm/issues/8836
RUN npm config set maxsockets 5
RUN npm config set registry http://registry.npmjs.org/
RUN npm config set strict-ssl false

RUN npm install -g node-dev node-gyp yarn

COPY package.json /code/package.json
COPY yarn.lock /code/yarn.lock
RUN yarn

COPY . /code
RUN yarn run transpile

# https://github.com/npm/npm/issues/4531
RUN npm config set unsafe-perm true

CMD ["yarn", "start"]
