#!/usr/bin/env node

var fs = require("fs"),
    _ = require("underscore"),
    express = require("express"),
    redis = require("redis"),
    mongo = require("mongoskin"),
    connect_redis = require("connect-redis")(express),
    everyauth = require("everyauth");
    shortid = require("shortid"),
    mediainfo = require("mediainfo"),
    common = require("./lib/common");

common.ctx.add_function("nice_time", function(input, args) {
  return (input || "").toString();
});

var rds = redis.createClient();

var db = mongo.db(process.env.MONGODB),
    clips = db.collection("clips"),
    users = db.collection("users");

clips.ensureIndex({id: 1}, {unique: true}, function(){});
users.ensureIndex({id: 1}, {unique: true}, function(){});

everyauth.everymodule.findUserById(function(id, done) {
  users.findOne({id: id}, done);
});

everyauth.twitter.consumerKey("jdlTWPGKYNZqUTyvENmdcw").consumerSecret("drEQioZFW3UwMOWbr3P7jdr2nzSIPa1VHBBQbIjs").findOrCreateUser(function(session, access_token, access_token_secret, metadata) {
  var promise = this.Promise();

  users.findOne({id: metadata.id}, {_id: false}, function(err, doc) {
    if (err) {
      throw err;
    }

    if (doc) {
      promise.fulfill(doc);
    } else {
      var user = {
        id: metadata.id,
        name: metadata.screen_name,
        created_at: new Date(),
        friends: [],
      };

      users.save(user, {safe: true}, function(err, doc) {
        if (err) {
          throw err;
        }

        promise.fulfill(doc);
      });
    }
  });

  return promise;
}).redirectPath("/");

var app = express.createServer();

app.configure(function() {
  app.use(function(req, res, next) {
    for (var i in common) {
      res[i] = common[i];
    }

    next();
  });
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser());
  app.use(express.session({secret: "sillysession", store: new connect_redis()}));
  app.use(everyauth.middleware());
  app.use(express.static(__dirname + "/public"));
  app.use(express.logger());
});

app.get("/", function(req, res) {
  res.send_response("pages/index.html", {app: {user: req.user}, page: {title: "Home"}});
});

app.get("/clips", function(req, res) {
  clips.find(null, {_id: false}).sort({created_at: -1}).limit(10).toArray(function(err, docs) {
    if (err) {
      return res.send(500);
    }

    res.send_response("pages/clips/list.html", {app: {user: req.user}, page: {title: "Clips"}, clips: docs});
  });
});

app.get("/clips/mine", common.ensure_logged_in, function(req, res) {
  clips.find({app: {user: req.user}.name}, {_id: false}).sort({created_at: -1}).limit(10).toArray(function(err, docs) {
    if (err) {
      return res.send(500);
    }

    res.send_response("pages/clips/list.html", {app: {user: req.user}, page: {title: "My Clips"}, clips: docs});
  });
});

app.get("/clips/upload", common.ensure_logged_in, function(req, res) {
  res.send_response("pages/clips/upload.html", {app: {user: req.user}, page: {title: "Upload Clip"}});
});

app.get("/clips/:id", function(req, res) {
  clips.findOne({id: req.param("id")}, {_id: false}, function(err, doc) {
    if (err) {
      return res.send(500);
    }

    if (!doc) {
      return res.send(404);
    }

    return res.send_response("pages/clips/view.html", {app: {user: req.user}, page: {title: doc.name}, clip: doc});
  });
});

app.post("/clips", common.ensure_logged_in, function(req, res) {
  var doc = req.body;
  doc.id = shortid.generate();
  doc.created_at = new Date();
  doc.created_by = req.user.name;
  doc.formats = [];
  doc.encoded = false;

  if (!req.files || !req.files.file) {
    return res.send(406);
  }

  mediainfo(req.files.file.path, function(err, info) {
    if (err) {
      return res.send(500);
    }

    fs.rename(req.files.file.path, __dirname + "/uploads/" + doc.id, function(err) {
      if (err) {
        return res.send(500);
      }

      clips.save(doc, {safe: true}, function(err, doc) {
        if (err) {
          return res.send(500);
        }

        rds.rpush("riffmint_encoding", [doc.id, "libvorbis", "ogg"].join(":"));
        rds.rpush("riffmint_encoding", [doc.id, "libmp3lame", "mp3"].join(":"));

        return res.redirect("/clips/" + doc.id);
      });
    });
  });
});

app.get("/download/:id.:format", function(req, res) {
  clips.findOne({id: req.param("id")}, {_id: false}, function(err, doc) {
    if (err) {
      return res.send(500);
    }

    if (!doc) {
      return res.send(404);
    }

    if (_.indexOf(doc.formats, req.param("format")) === -1) {
      return res.send(404);
    }

    res.setHeader("Content-Type", "audio/" + req.param("format"));
    res.sendfile("downloads/" + req.param("id") + "." + req.param("format"));
  });
});

app.get("/:user", function(req, res) {
  users.findOne({name: req.param("user")}, function(err, doc) {
    if (err) {
      return res.send(500);
    }

    if (!doc) {
      return res.send(404);
    }

    return res.send_response("pages/user/view.html", {});
  });
});

app.listen(process.env.PORT, process.env.HOST);
