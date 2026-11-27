// Next.js static export(out/) 경로를 S3 객체 키에 맞춘다.
//   /posts/foo  → /posts/foo.html
//   /dir/       → /dir/index.html
//   /a/b.png    → 그대로
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri.endsWith("/")) {
    request.uri = uri + "index.html";
  } else if (uri.split("/").pop().indexOf(".") === -1) {
    request.uri = uri + ".html";
  }

  return request;
}
