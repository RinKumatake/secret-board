'use strict';
const crypto = require('crypto');
const pug = require('pug');
const Cookies =require('cookies');
const util = require('./handler-util');
const Post = require('./post');
const moment = require('moment-timezone');

const trackingIdKey = 'tracking_id';

const oneTimeTokenMap = new Map(); // キーをユーザー名、値をトークンとする連想配列

function handle(req, res) {
  const cookies = new Cookies(req, res);
  const trackingId = addTrackingCookie(cookies, req.user);
 
  switch (req.method) {
    case 'GET':
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8'
      });
      Post.findAll({ order: [['id', 'DESC']] }).then((posts) => {
        posts.forEach((post) => {
          post.content = post.content.replace(/\+/g, ' ');
          post.formattedCreatedAt = moment(post.createdAt).tz('Asia/Tokyo').format('YYYY年MM月DD日 HH時mm分ss秒');
        });
        const oneTimeToken = crypto.randomBytes(8).toString('hex');
        oneTimeTokenMap.set(req.user, oneTimeToken);        
        res.end(pug.renderFile('./views/posts.pug', {
          posts: posts,
          user: req.user,
          oneTimeToken: oneTimeToken
        }));        
        console.info(
          `ぱんだ、閲覧されたよ: 
          user: ${req.user},
          トラッキングID: ${trackingId},
          IPアドレス: ${req.connection.remoteAddress},
          ユーザーエージェント: ${req.headers['user-agent'] }`
        );
      });      
      break;
    case 'POST':
      let body = '';
      req.on('data', (chunk) => {
        body = body + chunk;
        body = body.replace(/%2B/g, '%EF%BC%8B');
      }).on('end', () => {
        const decoded = decodeURIComponent(body);      
        const dataArray = decoded.split('&');
        const content = dataArray[0] ? dataArray[0].split('content=')[1] : '';
        const requestedOnetimeToken = dataArray[1] ? dataArray[1].split('oneTimeToken=')[1] : '';
        if (oneTimeTokenMap.get(req.user) === requestedOnetimeToken) {
          console.info(`ぱんだ、投稿されたよ: ${content}`);            
          Post.create({
            content: content,
            trackingCookie: trackingId,
            postedBy: req.user
         }).then(() => {
           oneTimeTokenMap.delete(req.user);
           handleRedirectPosts(req, res);
          }); 
        } else {
          util.handleBadRequest(req, res);
        }         
        });
      break;
    default:
      util.handleBadRequest(req, res);
      break;    
  }
}

function handleDelete(req, res) {
  switch (req.method) {    
    case 'POST':
      let body = '';
      req.on('data', (chunk) => {
        body = body + chunk;
      }).on('end', () => {
        const decoded = decodeURIComponent(body);
        const dataArray = decoded.split('&');
        const id = dataArray[0] ? dataArray[0].split('id=')[1] : '';
        const requestedOnetimeToken = dataArray[1] ? dataArray[1].split('oneTimeToken=')[1] : '';
        if (oneTimeTokenMap.get(req.user) === requestedOnetimeToken) {
          Post.findByPk(id).then((post) => {
            if (req.user === post.postedBy || req.user === 'admin') {
              post.destroy().then(() => {
                 console.info(
                   `ぱんだ、削除されたよ:
                   user: ${req.user},
                   remoteAddress: ${req.connection.remoteAddress},
                   userAgent: ${req.headers['user-agent']} `
                 );
                 oneTimeTokenMap.delete(req.user);            
                 handleRedirectPosts(req, res);
              });
              }         
           });        
          } else {
             util.handleBadRequest(req, res);
          }          
        
      });
      break;
    default:
      util.handleBadRequest(req, res);
      break;    
  }
}

/**
* Cookieに含まれているトラッキングIDに異常がなければその値を返し、
* 存在しない場合や異常なものである場合には、再度作成しCookieに付与してその値を返す
* @param {Cookies} cookies
* @param {String} userName
* @return {String} トラッキングID
*/

function addTrackingCookie(cookies, userName) {
  const requestedTrackingId = cookies.get(trackingIdKey);
  if (isValidTrackingId(requestedTrackingId, userName)) {
    return requestedTrackingId;
  } else {
    const originalId = parseInt(crypto.randomBytes(8).toString('hex').slice(0,8), 16);
    const tomorrow = new Date(Date.now() + (1000 * 60 * 60 * 24));
    const trackingId = originalId + '_' + createValidHash(originalId, userName);
    cookies.set(trackingIdKey, trackingId, {expires: tomorrow}); 
    return trackingId;
  }   
}

function isValidTrackingId(trackingId, userName) {
  if (!trackingId) {
    return false;
  }
  const splitted = trackingId.split('_');
  const originalId = splitted[0];
  const requestedHash = splitted[1];
  return createValidHash(originalId, userName) === requestedHash;
}

const secretKey =
  `96a943d07333d1f1c62ab1719446312f01b2491563b655c49d15ffa97582d768cb31ac5e1d8df603ef390d14aa7159368ed3929a097795ae92647c33b1c9b32f118fd2dddb11e6522608724fe87e86de7de28b76225762ef66b810591d2b11373cdcf57aa0238655bf11c8df2b489b8fd5473b34865c9621663c7f2291ae072d22d46588c03776326eaad1fb489deb639f7a89136bf499e9f57363087558d65da0ccb7611cdb2933a0eeff17faf11de406229270a3fa2a6df92e497ccc8b331206bee000fd65439dbdb5f943b84e333f5297a4ecf5b1834e5d3c10506bad5e24671b6df31ef320ee1514fedbf29f3fbe99a84977a38f3b3247529d088f8f164a`;

function createValidHash(originalId, userName) {
  const sha1sum = crypto.createHash('sha1');
  sha1sum.update(originalId + userName + secretKey);
  return sha1sum.digest('hex');
}

function handleRedirectPosts(req, res) {
  res.writeHead(303, {
    'Location': '/posts'
  });
  res.end();
}

module.exports = {
  handle,
  handleDelete
};