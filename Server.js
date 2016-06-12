var express = require('express');
var bodyParser = require('body-parser');
var nodemailer = require("nodemailer");
var redis = require('redis');
var redisClient = redis.createClient(); // default setting.
var mandrillTransport = require('nodemailer-mandrill-transport');
var async = require('async');
var app = express();

/*
	* Here we are configuring our SMTP Server details.
	* STMP is mail server which is responsible for sending and recieving email.
  * We are using Mandrill here.
*/

var smtpTransport = nodemailer.createTransport(mandrillTransport({
    auth: {
      apiKey : ''
    }
}));
/*------------------SMTP Over-----------------------------*/

/*------------------Routing Started ------------------------*/
var host = "localhost:3000";
app.use(bodyParser.urlencoded({"extended" : false}));

app.get('/',function(req,res){
	res.sendfile('index.html');
});
app.post('/send',function(req,res) {
  console.log(req.body.to);
  async.waterfall([
    function(callback) {
      redisClient.exists(req.body.to,function(err,reply) {
        if(err) {
          return callback(true,"Error in redis");
        }
        if(reply === 1) {
          return callback(true,"Email already requested");
        }
        callback(null);
      });
    },
    function(callback) {
      let rand=Math.floor((Math.random() * 100) + 54);
      let encodedMail = new Buffer(req.body.to).toString('base64');
      let link="http://"+req.get('host')+"/verify?mail="+encodedMail+"&id="+rand;
      let mailOptions={
        from : '',
        to : req.body.to,
        subject : "Please confirm your Email account",
        html : "Hello,<br> Please Click on the link to verify your email.<br><a href="+link+">Click here to verify</a>"
      };
      callback(null,mailOptions,rand);
    },
    function(mailData,secretKey,callback) {
      console.log(mailData);
      smtpTransport.sendMail(mailData, function(error, response){
         if(error){
          console.log(error);
          return callback(true,"Error in sending email");
       }
        console.log("Message sent: " + JSON.stringify(response));
        redisClient.set(req.body.to,secretKey);
        redisClient.expire(req.body.to,600); // expiry for 10 minutes.
        callback(null,"Email sent Successfully");
    });
    }
  ],function(err,data) {
    console.log(err,data);
    res.json({error : err === null ? false : true, data : data});
  });
});

app.get('/verify',function(req,res) {
  console.log(req.protocol+":/"+req.get('host'));
  if((req.protocol+"://"+req.get('host')) === ("http://"+host)) {
  	console.log("Domain is matched. Information is from Authentic email");
    async.waterfall([
      function(callback) {
        let decodedMail = new Buffer(req.query.mail, 'base64').toString('ascii');
        redisClient.get(decodedMail,function(err,reply) {
          if(err) {
            return callback(true,"Error in redis");
          }
          if(reply === null) {
            return callback(true,"Invalid email address");
          }
          callback(null,decodedMail,reply);
        });
      },
      function(key,redisData,callback) {
        if(redisData === req.query.id) {
          redisClient.del(key,function(err,reply) {
            if(err) {
              return callback(true,"Error in redis");
            }
            if(reply !== 1) {
              return callback(true,"Issue in redis");
            }
            callback(null,"Email is verified");
          });
        } else {
          return callback(true,"Invalid token");
        }
      }
    ],function(err,data) {
      res.send(data);
    });
  } else {
  	res.end("<h1>Request is from unknown source");
  }
});

/*--------------------Routing Over----------------------------*/

app.listen(3000,function(){
	console.log("Express Started on Port 3000");
});
