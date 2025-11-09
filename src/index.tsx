import { serve } from "bun";
import index from "./index.html";

const server = serve({
  routes: {
    // Serve the PDF.js worker file as a static file
    "/pdf.worker.min.mjs": new Response(
      Bun.file(import.meta.dir + "/pdf.worker.min.mjs")
    ),

    // Serve images from the images directory
    "/images/:filename": (req) => {
      const filename = req.params.filename;
      return new Response(Bun.file(import.meta.dir + "/images/" + filename));
    },

    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/hello": {
      async GET(req) {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT(req) {
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        });
      },
    },

    "/api/hello/:name": async (req) => {
      const name = req.params.name;
      return Response.json({
        message: `Hello, ${name}!`,
      });
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
