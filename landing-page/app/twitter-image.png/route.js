export const runtime = "edge";

export async function GET(request) {
  const baseUrl = new URL(request.url);
  baseUrl.pathname = "/twitter-image";
  baseUrl.search = "";
  return Response.redirect(baseUrl.toString(), 302);
}

