FROM node:8.1-alpine

WORKDIR /code

RUN yarn global add node-dev node-gyp

COPY package.json /code/package.json
COPY yarn.lock /code/yarn.lock
RUN yarn

COPY . /code
RUN yarn run transpile

CMD ["yarn", "start"]
