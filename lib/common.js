var fs = require("fs"),
    mongo = require("mongoskin"),
    Ginger = require("ginger");

var compiler = new Ginger.Compiler(),
    ctx = new Ginger.Context();

ctx.on_not_found = function(name, cb) {
  console.log("Loading template: " + name);

  fs.readFile(__dirname + "/../views/" + name + ".ginger", function(err, data) {
    if (err) {
      return cb(err);
    }

    var parsed = Ginger.Parser.parse(data.toString());
    var compiled = compiler.compile(parsed);

    var fn = new Function("ctx", "cb", compiled);

    // Uncomment me to cache compiled templates
    //ctx.add_template(name, fn);

    cb(null, fn);
  });
};

exports.ctx = ctx;

exports.send_response = function(template, data) {
  data = data || {};

  if (this.req.isXMLHttpRequest) {
    return this.json({template: template, data: data});
  }

  var self = this;
  ctx.create_child(data).render(template, function(err, data) {
    self.send(data);
  });
};

exports.ensure_logged_in = function(req, res, next) {
  if (!req.user) {
    return res.redirect("/");
  }

  next();
};

exports.ensure_logged_out = function(req, res, next) {
  if (!!req.user) {
    return res.redirect("/");
  }

  next();
};
