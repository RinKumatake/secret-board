'use strict';
const http = require('http');
const auth = require('http-auth');
const router = require('./lib/router');

const basic = auth.basic({
  realm: 'Enter usernama and password.',
  file: './users.htpasswd'
});

//関数を引数にとるcreateServerを実行
//createServerの返り値はオブジェクトなのでserver変数に代入
const server = http.createServer(basic, (req, res) => {
  router.route(req, res);
}).on('error', (e) => {
  console.error('Server Error', e);
}).on('Client Error', (e) => {
  console.error('Client Error', e);
});

const port = 8000;
server.listen(port, () => {
  console.info(`Listening on ${port} 番でサーバーを起動`);
});
