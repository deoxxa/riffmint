#!/usr/bin/env node

var fs = require("fs"),
    redis = require("redis"),
    mongo = require("mongoskin"),
    ffmpeg = require("fluent-ffmpeg");

var rds = redis.createClient(process.env.REDIS);
var clips = mongo.db(process.env.MONGODB).collection("clips");

var work = process.nextTick.bind(process, wait_and_work);
function wait_and_work() {
  rds.blpop("riffmint_encoding", 0, function(err, res) {
    if (err) {
      console.log(err);
      return work();
    }

    var job = res.pop().split(/:/);

    new ffmpeg(__dirname + "/../uploads/" + job[0]).withAudioCodec(job[1]).toFormat(job[2]).saveToFile(__dirname + "/../downloads/" + job[0] + "." + job[2], function(ret, err) {
      console.log([ret, err]);

      clips.update({id: job[0]}, {$push: {formats: job[2]}}, function(err) {
        if (err) {
          console.log(err);
          return work();
        }

        console.log("Encoded " + job[0] + " to " + job[2] + "/" + job[1]);

        work();
      });
    });
  });
}
work();
