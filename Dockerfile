FROM mhart/alpine-node:6.7

WORKDIR /code

RUN npm --version
RUN ulimit -n

# https://github.com/npm/npm/issues/7862
# https://github.com/npm/npm/issues/8836
RUN npm config set maxsockets 5
RUN npm config set registry http://registry.npmjs.org/
RUN npm config set strict-ssl false

RUN npm install -g node-dev node-gyp

COPY package.json /code/package.json
RUN npm install

COPY . /code
RUN npm run transpile

# https://github.com/npm/npm/issues/4531
RUN npm config set unsafe-perm true

CMD ["npm", "start"]
