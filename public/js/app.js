$.domReady(function() {
  ctx = ctx.create_child({ajax: true});

  var render_response = function(response) {
    ctx.create_child(response.data).render(response.template, function(err, html) {
      $("#content").html(html);
      $("#title").html(response.data.page.title);
      document.title = response.data.page.title + " - Riff Mint";
    });
  };

  $(window).on("popstate", function(e) {
    if (e.originalEvent.state) {
      render_response(e.originalEvent.state);
    }
  });

  $(document).delegate("a.ajax", "click", function(e) {
    e.stopPropagation();
    e.preventDefault();

    var a = e.target;

    $.ajax({
      url: a.href,
      type: "json",
      success: function(response) {
        render_response(response);

        if (window.history && (typeof window.history.pushState === "function") && false) {
          window.history.pushState(response, response.data.page.title, a.href);
        }
      },
    });
  });
});
